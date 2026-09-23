import 'server-only';

import { randomUUID } from 'node:crypto';
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';

import { toMysqlDate } from '@/lib/audit';
import { convertDocxToPdf } from '@/lib/docx-convert';
import { decryptValue, encryptValue, valueHash } from '@/lib/encryption';
import { getMysqlPool } from '@/lib/mysql';
import {
  readPrivateObject,
  removePrivateObject,
  storePrivateObject,
} from '@/lib/private-storage';
import { assertMailConfigured, enqueueInvitations } from '@/lib/signing-mail';
import {
  envelopeStatus,
  fromMysqlUtc,
  hashSigningToken,
  nextEligibleSigners,
  validateReminderDays,
  type SignerState,
} from '@/lib/signing-domain';
import {
  fillPdf,
  inspectTemplate,
  mergeDocx,
  sha256,
  type TemplateField,
} from '@/lib/template-files';

export type RecipientInput = { role: string; name: string; email: string };
export type EnvelopeInput = {
  templateVersionId: string;
  title: string;
  routingMode: 'ordered' | 'parallel';
  expiresInDays: number;
  reminderDays: number[];
  adminValues: Record<string, string>;
  recipients: RecipientInput[];
};

type TemplateRow = RowDataPacket & {
  id: string;
  source_hash: string;
  source_storage_key: string;
  layout_strategy: 'docx_merge' | 'pdf_overlay';
  lifecycle: string;
  signer_plan_json:
    | string
    | Array<{ role: string; order: number; required: boolean }>;
};
type FieldRow = RowDataPacket & {
  id: string;
  field_name: string;
  label: string;
  field_type: TemplateField['fieldType'];
  populated_by: 'admin' | 'participant' | 'signer' | 'system';
  signer_role: string;
  page_number: number | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  required: number;
};
type EnvelopeRow = RowDataPacket & {
  id: string;
  template_version_id: string;
  title: string;
  status: string;
  created_by: string;
  expires_at: string;
  routing_mode: string;
};
type SignerRow = RowDataPacket & {
  id: string;
  signer_role: string;
  name_encrypted: string;
  email_encrypted: string;
  routing_order: number;
  is_required: number;
  status: SignerState['status'];
};

export function validateEnvelopeInput(value: unknown): EnvelopeInput {
  if (!value || typeof value !== 'object')
    throw new Error('Document details are required.');
  const input = value as Partial<EnvelopeInput>;
  if (!/^[a-f0-9-]{36}$/i.test(input.templateVersionId ?? ''))
    throw new Error('Choose an active template version.');
  if (
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 255 ||
    /\p{Cc}/u.test(input.title)
  )
    throw new Error('Enter a document title of at most 255 characters.');
  if (input.routingMode !== 'ordered' && input.routingMode !== 'parallel')
    throw new Error('Choose ordered or parallel routing.');
  if (
    !Number.isInteger(input.expiresInDays) ||
    input.expiresInDays! < 1 ||
    input.expiresInDays! > 365
  )
    throw new Error('Expiration must be between 1 and 365 days.');
  const reminderDays = validateReminderDays(input.reminderDays);
  if (reminderDays.some((day) => day >= input.expiresInDays!))
    throw new Error('Reminder days must be before expiration.');
  if (
    !input.adminValues ||
    typeof input.adminValues !== 'object' ||
    Array.isArray(input.adminValues)
  )
    throw new Error('Admin values are invalid.');
  if (
    !Array.isArray(input.recipients) ||
    input.recipients.length < 1 ||
    input.recipients.length > 10
  )
    throw new Error('Provide 1–10 recipients.');
  const roles = new Set<string>();
  for (const recipient of input.recipients) {
    if (
      !recipient ||
      typeof recipient.role !== 'string' ||
      roles.has(recipient.role) ||
      typeof recipient.name !== 'string' ||
      !recipient.name.trim() ||
      recipient.name.length > 160 ||
      /\p{Cc}/u.test(recipient.name) ||
      typeof recipient.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email) ||
      recipient.email.length > 320
    )
      throw new Error(
        'Each recipient needs a unique role, name, and valid email.',
      );
    roles.add(recipient.role);
  }
  for (const [name, content] of Object.entries(input.adminValues))
    if (
      !/^[a-z][a-z0-9_]{0,189}$/.test(name) ||
      typeof content !== 'string' ||
      content.length > 500 ||
      /\p{Cc}/u.test(content)
    )
      throw new Error('An administrator field value is invalid.');
  return {
    templateVersionId: input.templateVersionId!,
    title: input.title.trim(),
    routingMode: input.routingMode,
    expiresInDays: input.expiresInDays!,
    reminderDays,
    adminValues: input.adminValues,
    recipients: input.recipients,
  };
}

export async function saveDraft(
  input: EnvelopeInput,
  actorId: string,
  existingId?: string,
) {
  const connection = await getMysqlPool().getConnection();
  const id = existingId ?? randomUUID();
  try {
    await connection.beginTransaction();
    if (existingId) {
      const [old] = await connection.query<EnvelopeRow[]>(
        'SELECT * FROM envelopes WHERE id = ? FOR UPDATE',
        [existingId],
      );
      if (!old[0] || old[0].status !== 'draft' || old[0].created_by !== actorId)
        throw new Error('Only your unsent draft can be edited.');
      await connection.execute('DELETE FROM signers WHERE envelope_id = ?', [
        id,
      ]);
      await connection.execute(
        'DELETE FROM field_values WHERE envelope_id = ?',
        [id],
      );
    }
    const [templates] = await connection.query<TemplateRow[]>(
      'SELECT * FROM template_versions WHERE id = ? FOR UPDATE',
      [input.templateVersionId],
    );
    const template = templates[0];
    if (!template || template.lifecycle !== 'active')
      throw new Error('Choose an active template version.');
    const plan = parseSignerPlan(template.signer_plan_json);
    for (const required of plan.filter((item) => item.required))
      if (
        !input.recipients.some((recipient) => recipient.role === required.role)
      )
        throw new Error(`Recipient for ${required.role} is required.`);
    for (const recipient of input.recipients)
      if (!plan.some((item) => item.role === recipient.role))
        throw new Error(`Unknown signer role: ${recipient.role}.`);
    const [fields] = await connection.query<FieldRow[]>(
      'SELECT * FROM template_fields WHERE template_version_id = ? ORDER BY display_order',
      [template.id],
    );
    const allowed = new Map(
      fields
        .filter((field) => field.populated_by === 'admin')
        .map((field) => [field.field_name, field]),
    );
    for (const name of Object.keys(input.adminValues))
      if (!allowed.has(name)) throw new Error(`Unknown admin field: ${name}.`);
    for (const field of allowed.values())
      if (field.required && !input.adminValues[field.field_name]?.trim())
        throw new Error(`Admin field ${field.label} is required.`);
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000);
    if (existingId)
      await connection.execute(
        `UPDATE envelopes SET template_version_id = ?, title = ?, routing_mode = ?,
       reminder_schedule_json = ?, expires_at = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
        [
          template.id,
          input.title,
          input.routingMode,
          JSON.stringify(input.reminderDays),
          toMysqlDate(expiresAt),
          id,
        ],
      );
    else
      await connection.execute<ResultSetHeader>(
        `INSERT INTO envelopes
       (id, template_version_id, title, status, routing_mode, reminder_schedule_json,
        created_by, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
        [
          id,
          template.id,
          input.title,
          input.routingMode,
          JSON.stringify(input.reminderDays),
          actorId,
          toMysqlDate(expiresAt),
        ],
      );
    for (const recipient of input.recipients) {
      const signerId = randomUUID();
      const assignment = plan.find((item) => item.role === recipient.role)!;
      await connection.execute(
        `INSERT INTO signers
         (id, envelope_id, signer_role, name_encrypted, email_encrypted, routing_order,
          is_required, status, token_hash, token_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          signerId,
          id,
          recipient.role,
          encryptValue(recipient.name.trim(), `signer:${signerId}:name`),
          encryptValue(
            recipient.email.trim().toLowerCase(),
            `signer:${signerId}:email`,
          ),
          input.routingMode === 'parallel' ? 1 : assignment.order,
          assignment.required,
          hashSigningToken(randomUUID()),
          toMysqlDate(expiresAt),
        ],
      );
    }
    for (const [name, value] of Object.entries(input.adminValues)) {
      if (!value) continue;
      const field = allowed.get(name)!;
      await connection.execute(
        `INSERT INTO field_values
         (id, envelope_id, template_field_id, signer_id, encrypted_value, value_hash, created_at)
         VALUES (?, ?, ?, NULL, ?, ?, UTC_TIMESTAMP(6))`,
        [
          randomUUID(),
          id,
          field.id,
          encryptValue(value, `field:${id}:${field.id}`),
          valueHash(value),
        ],
      );
    }
    await connection.commit();
    return id;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function sendDraft(envelopeId: string, actorId: string) {
  assertMailConfigured();
  const connection = await getMysqlPool().getConnection();
  let fileKey: string | null = null;
  try {
    await connection.beginTransaction();
    const [envelopes] = await connection.query<EnvelopeRow[]>(
      'SELECT * FROM envelopes WHERE id = ? FOR UPDATE',
      [envelopeId],
    );
    const envelope = envelopes[0];
    if (
      !envelope ||
      envelope.status !== 'draft' ||
      envelope.created_by !== actorId
    )
      throw new Error('Only your unsent draft can be sent.');
    if (fromMysqlUtc(envelope.expires_at).getTime() <= Date.now())
      throw new Error('Draft expiration must be in the future.');
    const [templates] = await connection.query<TemplateRow[]>(
      'SELECT * FROM template_versions WHERE id = ?',
      [envelope.template_version_id],
    );
    const template = templates[0];
    if (!template || template.lifecycle !== 'active')
      throw new Error('The template version is no longer active.');
    const source = await readPrivateObject(template.source_storage_key);
    if (sha256(source) !== template.source_hash)
      throw new Error('Template source failed SHA-256 verification.');
    const [fields] = await connection.query<FieldRow[]>(
      'SELECT * FROM template_fields WHERE template_version_id = ? ORDER BY display_order',
      [template.id],
    );
    const [values] = await connection.query<
      Array<
        RowDataPacket & { template_field_id: string; encrypted_value: string }
      >
    >(
      'SELECT template_field_id, encrypted_value FROM field_values WHERE envelope_id = ?',
      [envelopeId],
    );
    const byField = new Map(
      values.map((row) => [row.template_field_id, row.encrypted_value]),
    );
    const textValues: Record<string, string> = {};
    for (const field of fields) {
      const encrypted = byField.get(field.id);
      if (encrypted)
        textValues[field.field_name] = decryptValue(
          encrypted,
          `field:${envelopeId}:${field.id}`,
        );
      else if (field.populated_by === 'system' && field.field_type === 'date')
        textValues[field.field_name] = new Date().toISOString().slice(0, 10);
    }
    let pdf: Uint8Array;
    if (template.layout_strategy === 'docx_merge') {
      const inspection = await inspectTemplate(source, 'docx');
      for (const name of inspection.placeholders) textValues[name] ??= '';
      pdf = await convertDocxToPdf(mergeDocx(source, textValues));
    } else {
      pdf = await fillPdf(source, fields.map(toTemplateField), textValues);
    }
    const documentId = randomUUID();
    fileKey = await storePrivateObject('documents', envelopeId, 'pdf', pdf);
    if (sha256(await readPrivateObject(fileKey)) !== sha256(pdf))
      throw new Error('Prepared document failed storage verification.');
    await connection.execute(
      `INSERT INTO document_versions
       (id, envelope_id, version_kind, source_hash, document_hash, storage_key, byte_length, created_at)
       VALUES (?, ?, 'prepared', ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [
        documentId,
        envelopeId,
        template.source_hash,
        sha256(pdf),
        fileKey,
        pdf.length,
      ],
    );
    const [signerRows] = await connection.query<SignerRow[]>(
      'SELECT * FROM signers WHERE envelope_id = ? ORDER BY routing_order',
      [envelopeId],
    );
    const signers = signerRows.map(toSignerState);
    if (!signers.some((signer) => signer.required))
      throw new Error('At least one required signer is needed.');
    await connection.execute(
      `UPDATE envelopes SET status = 'sent', locked_at = UTC_TIMESTAMP(6), updated_at = UTC_TIMESTAMP(6)
       WHERE id = ? AND status = 'draft'`,
      [envelopeId],
    );
    await enqueueInvitations(
      connection,
      nextEligibleSigners(signers).map((signer) => signer.id),
    );
    await connection.commit();
    return { documentId, hash: sha256(pdf) };
  } catch (error) {
    await connection.rollback();
    if (fileKey) await removePrivateObject(fileKey).catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function voidEnvelope(envelopeId: string, actorId: string) {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<EnvelopeRow[]>(
      'SELECT * FROM envelopes WHERE id = ? FOR UPDATE',
      [envelopeId],
    );
    if (
      !rows[0] ||
      rows[0].created_by !== actorId ||
      ['completed', 'declined', 'expired', 'voided'].includes(rows[0].status)
    )
      throw new Error('This document cannot be voided.');
    await connection.execute(
      `UPDATE envelopes SET status = 'voided', updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
      [envelopeId],
    );
    await connection.execute(
      `UPDATE signer_sessions SET revoked_at = UTC_TIMESTAMP(6)
       WHERE signer_id IN (SELECT id FROM signers WHERE envelope_id = ?) AND revoked_at IS NULL`,
      [envelopeId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function parseSignerPlan(value: TemplateRow['signer_plan_json']) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (
    !Array.isArray(parsed) ||
    !parsed.every(
      (item) =>
        item &&
        typeof item.role === 'string' &&
        Number.isInteger(item.order) &&
        typeof item.required === 'boolean',
    )
  )
    throw new Error('Template signer plan is invalid.');
  return parsed as Array<{ role: string; order: number; required: boolean }>;
}

export function toTemplateField(row: FieldRow): TemplateField {
  return {
    fieldName: row.field_name,
    label: row.label,
    fieldType: row.field_type,
    populatedBy:
      row.populated_by === 'admin'
        ? 'admin-fill'
        : row.populated_by === 'participant'
          ? 'participant-fill'
          : row.populated_by,
    signerRole: row.signer_role,
    pageNumber: row.page_number,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    required: Boolean(row.required),
  };
}

export function toSignerState(row: SignerRow): SignerState {
  return {
    id: row.id,
    routingOrder: row.routing_order,
    required: Boolean(row.is_required),
    status: row.status,
  };
}

export async function refreshEnvelopeStatus(
  connection: PoolConnection,
  envelopeId: string,
  current: string,
) {
  const [rows] = await connection.query<SignerRow[]>(
    'SELECT id, routing_order, is_required, status FROM signers WHERE envelope_id = ?',
    [envelopeId],
  );
  const signers = rows.map(toSignerState);
  const status = envelopeStatus(signers, current);
  await connection.execute(
    `UPDATE envelopes SET status = ?, completed_at = IF(? = 'completed', UTC_TIMESTAMP(6), completed_at),
     updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
    [status, status, envelopeId],
  );
  if (!['completed', 'declined', 'expired', 'voided'].includes(status))
    await enqueueInvitations(
      connection,
      nextEligibleSigners(signers).map((signer) => signer.id),
    );
  return status;
}
