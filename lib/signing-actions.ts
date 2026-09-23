import 'server-only';

import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';

import { appendAuditEventInTransaction, toMysqlDate } from '@/lib/audit';
import { convertDocxToPdf } from '@/lib/docx-convert';
import { decryptValue, encryptValue, valueHash } from '@/lib/encryption';
import { refreshEnvelopeStatus, toTemplateField } from '@/lib/envelopes';
import { finalizeCompletedEnvelope } from '@/lib/finalization';
import { getMysqlPool } from '@/lib/mysql';
import {
  readPrivateObject,
  removePrivateObject,
  storePrivateObject,
} from '@/lib/private-storage';
import type { RecipientSession } from '@/lib/recipient-session';
import { getClientIp } from '@/lib/request-security';
import { fromMysqlUtc } from '@/lib/signing-domain';
import {
  appendSignatureEvidence,
  drawSignatureImages,
  fillPdf,
  inspectTemplate,
  mergeDocx,
  sha256,
  type TemplateField,
} from '@/lib/template-files';

export const CONSENT_VERSION = '2026-09-draft-1';
export const CONSENT_TEXT =
  'I agree to use an electronic signature for this document. I have reviewed the document shown above, and I intend my signature to be legally binding.';

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
type DocumentRow = RowDataPacket & {
  id: string;
  document_hash: string;
  storage_key: string;
};
type SignerRow = RowDataPacket & {
  id: string;
  status: string;
  token_used_at: string | null;
  name_encrypted: string;
};
type EventRow = RowDataPacket & { submission_hash: string };

export type SigningInput = {
  presentedHash: string;
  consent: true;
  method: 'typed' | 'drawn';
  typedName?: string;
  drawnPng?: string;
  values: Record<string, string>;
};

export function validateSigningInput(raw: unknown): SigningInput {
  if (!raw || typeof raw !== 'object')
    throw new Error('Signing details are required.');
  const input = raw as Partial<SigningInput>;
  if (!/^[a-f0-9]{64}$/.test(input.presentedHash ?? ''))
    throw new Error('The presented document hash is invalid.');
  if (input.consent !== true)
    throw new Error('Electronic-signature consent is required.');
  if (input.method !== 'typed' && input.method !== 'drawn')
    throw new Error('Choose a signature method.');
  if (
    input.method === 'typed' &&
    (typeof input.typedName !== 'string' ||
      !input.typedName.trim() ||
      input.typedName.length > 160 ||
      /\p{Cc}/u.test(input.typedName))
  )
    throw new Error('Type your full name as your signature.');
  if (
    input.method === 'drawn' &&
    (typeof input.drawnPng !== 'string' ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.drawnPng) ||
      input.drawnPng.length > 250_000)
  )
    throw new Error('Draw a signature before continuing.');
  if (
    !input.values ||
    typeof input.values !== 'object' ||
    Array.isArray(input.values) ||
    Object.keys(input.values).length > 300
  )
    throw new Error('Signer fields are invalid.');
  for (const [name, value] of Object.entries(input.values))
    if (
      !/^[a-z][a-z0-9_]{0,189}$/.test(name) ||
      typeof value !== 'string' ||
      value.length > 500 ||
      /\p{Cc}/u.test(value)
    )
      throw new Error('A signer field is invalid.');
  return input as SigningInput;
}

export async function markViewed(session: RecipientSession) {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [envelopes] = await connection.query<
      Array<RowDataPacket & { status: string }>
    >('SELECT status FROM envelopes WHERE id = ? FOR UPDATE', [
      session.envelope_id,
    ]);
    if (
      !envelopes[0] ||
      !['sent', 'viewed', 'partially_signed'].includes(envelopes[0].status)
    )
      throw new Error('This document is no longer open.');
    await connection.execute(
      `UPDATE signers SET status = 'viewed', viewed_at = COALESCE(viewed_at, UTC_TIMESTAMP(6))
       WHERE id = ? AND status = 'sent'`,
      [session.signer_id],
    );
    await refreshEnvelopeStatus(
      connection,
      session.envelope_id,
      envelopes[0].status,
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function declineDocument(
  session: RecipientSession,
  request: Request,
) {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [envelopes] = await connection.query<
      Array<RowDataPacket & { status: string }>
    >('SELECT status FROM envelopes WHERE id = ? FOR UPDATE', [
      session.envelope_id,
    ]);
    if (
      !envelopes[0] ||
      !['sent', 'viewed', 'partially_signed'].includes(envelopes[0].status)
    )
      throw new Error('This document is no longer open.');
    const [result] = await connection.execute(
      `UPDATE signers SET status = 'declined', token_used_at = UTC_TIMESTAMP(6)
       WHERE id = ? AND status IN ('sent', 'viewed') AND token_used_at IS NULL`,
      [session.signer_id],
    );
    if ((result as { affectedRows: number }).affectedRows !== 1)
      throw new Error('This invitation is no longer available.');
    await connection.execute(
      `UPDATE signer_sessions SET revoked_at = UTC_TIMESTAMP(6)
       WHERE signer_id = ? AND revoked_at IS NULL`,
      [session.signer_id],
    );
    const status = await refreshEnvelopeStatus(
      connection,
      session.envelope_id,
      envelopes[0].status,
    );
    await appendAuditEventInTransaction(connection, {
      actorType: 'signer',
      actorId: session.signer_id,
      envelopeId: session.envelope_id,
      eventType: 'DOCUMENT_DECLINED',
      details: { status },
      userAgent: encryptValue(
        request.headers.get('user-agent') ?? 'unavailable',
        `envelope:${session.envelope_id}:audit_ua`,
      ),
    });
    await connection.commit();
    return status;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function submitSignature(
  session: RecipientSession,
  input: SigningInput,
  request: Request,
) {
  const submissionHash = valueHash(JSON.stringify(input));
  if (input.presentedHash !== session.presented_document_hash)
    throw new Error(
      'The document changed. Reopen your invitation and review it again.',
    );
  const connection = await getMysqlPool().getConnection();
  let signatureKey: string | null = null;
  let documentKey: string | null = null;
  try {
    await connection.beginTransaction();
    const [envelopes] = await connection.query<
      Array<
        RowDataPacket & {
          status: string;
          expires_at: string;
          template_version_id: string;
        }
      >
    >(
      'SELECT status, expires_at, template_version_id FROM envelopes WHERE id = ? FOR UPDATE',
      [session.envelope_id],
    );
    const envelope = envelopes[0];
    const [signers] = await connection.query<SignerRow[]>(
      'SELECT id, status, token_used_at, name_encrypted FROM signers WHERE id = ? FOR UPDATE',
      [session.signer_id],
    );
    const signer = signers[0];
    if (!signer || !envelope)
      throw new Error('Signing invitation is unavailable.');
    const [events] = await connection.query<EventRow[]>(
      'SELECT submission_hash FROM signature_events WHERE signer_id = ? LIMIT 1',
      [session.signer_id],
    );
    if (signer.status === 'signed') {
      if (events[0]?.submission_hash === submissionHash) {
        await connection.rollback();
        return { status: 'already_signed' as const };
      }
      throw new Error('This signing link was already used.');
    }
    if (
      !['sent', 'viewed', 'partially_signed'].includes(envelope.status) ||
      !['sent', 'viewed'].includes(signer.status) ||
      signer.token_used_at ||
      fromMysqlUtc(String(envelope.expires_at)).getTime() <= Date.now()
    )
      throw new Error(
        'This signing link has expired or the document is closed.',
      );
    const [presented] = await connection.query<DocumentRow[]>(
      'SELECT id, document_hash, storage_key FROM document_versions WHERE id = ? AND envelope_id = ?',
      [session.presented_document_id, session.envelope_id],
    );
    if (!presented[0] || presented[0].document_hash !== input.presentedHash)
      throw new Error('Presented document mismatch.');
    if (
      sha256(await readPrivateObject(presented[0].storage_key)) !==
      input.presentedHash
    )
      throw new Error('Presented document failed SHA-256 verification.');
    const [fieldRows] = await connection.query<FieldRow[]>(
      'SELECT * FROM template_fields WHERE template_version_id = ? ORDER BY display_order',
      [envelope.template_version_id],
    );
    const assigned = fieldRows.filter(
      (field) =>
        field.signer_role === session.signer_role &&
        (field.populated_by === 'participant' ||
          field.populated_by === 'signer'),
    );
    const allowed = new Map(assigned.map((field) => [field.field_name, field]));
    for (const name of Object.keys(input.values))
      if (!allowed.has(name) || allowed.get(name)?.field_type === 'signature')
        throw new Error(`Field ${name} is not assigned to you.`);
    for (const field of assigned)
      if (
        field.required &&
        field.field_type !== 'signature' &&
        !input.values[field.field_name]?.trim()
      )
        throw new Error(`${field.label} is required.`);
    const signerName = decryptValue(
      signer.name_encrypted,
      `signer:${signer.id}:name`,
    );
    const signatureText =
      input.method === 'typed' ? input.typedName!.trim() : signerName;
    const png =
      input.method === 'drawn'
        ? new Uint8Array(Buffer.from(input.drawnPng!.split(',')[1], 'base64'))
        : null;
    if (
      png &&
      (png.length < 100 ||
        png.length > 180_000 ||
        !Buffer.from(png.subarray(0, 8)).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        ) ||
        new DataView(png.buffer, png.byteOffset, png.byteLength).getUint32(16) >
          2048 ||
        new DataView(png.buffer, png.byteOffset, png.byteLength).getUint32(20) >
          1024)
    )
      throw new Error('Drawn signature must be a valid PNG under 180 KB.');
    const newValues = { ...input.values };
    for (const field of assigned.filter(
      (item) => item.field_type === 'signature',
    ))
      newValues[field.field_name] = signatureText;
    for (const [name, value] of Object.entries(newValues)) {
      if (!value) continue;
      const field = allowed.get(name)!;
      await connection.execute(
        `INSERT INTO field_values
         (id, envelope_id, template_field_id, signer_id, encrypted_value, value_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
        [
          randomUUID(),
          session.envelope_id,
          field.id,
          session.signer_id,
          encryptValue(value, `field:${session.envelope_id}:${field.id}`),
          valueHash(value),
        ],
      );
    }
    const [documents] = await connection.query<DocumentRow[]>(
      `SELECT id, document_hash, storage_key FROM document_versions
       WHERE envelope_id = ? AND version_kind IN ('prepared', 'intermediate', 'final')
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [session.envelope_id],
    );
    const current = documents[0];
    if (!current) throw new Error('Prepared document is missing.');
    let pdf: Uint8Array = await readPrivateObject(current.storage_key);
    if (sha256(pdf) !== current.document_hash)
      throw new Error('Current document failed SHA-256 verification.');
    const [templates] = await connection.query<
      Array<
        RowDataPacket & {
          layout_strategy: string;
          source_storage_key: string;
          source_hash: string;
        }
      >
    >(
      'SELECT layout_strategy, source_storage_key, source_hash FROM template_versions WHERE id = ?',
      [envelope.template_version_id],
    );
    const template = templates[0];
    if (!template) throw new Error('Template version is missing.');
    if (template.layout_strategy === 'docx_merge') {
      const source = await readPrivateObject(template.source_storage_key);
      if (sha256(source) !== template.source_hash)
        throw new Error('Template source changed.');
      const [rows] = await connection.query<
        Array<
          RowDataPacket & { template_field_id: string; encrypted_value: string }
        >
      >(
        'SELECT template_field_id, encrypted_value FROM field_values WHERE envelope_id = ?',
        [session.envelope_id],
      );
      const fieldById = new Map(
        fieldRows.map((field) => [field.id, field.field_name]),
      );
      const textValues: Record<string, string> = {};
      for (const row of rows) {
        const name = fieldById.get(row.template_field_id);
        if (name)
          textValues[name] = decryptValue(
            row.encrypted_value,
            `field:${session.envelope_id}:${row.template_field_id}`,
          );
      }
      const inspection = await inspectTemplate(source, 'docx');
      for (const name of inspection.placeholders) textValues[name] ??= '';
      pdf = await convertDocxToPdf(mergeDocx(source, textValues));
      const [pastEvents] = await connection.query<
        Array<
          RowDataPacket & {
            id: string;
            signer_id: string;
            signer_role: string;
            name_encrypted: string;
            signature_method: 'typed' | 'drawn';
            signature_storage_key: string;
            presented_document_hash: string;
            signed_at: string;
          }
        >
      >(
        `SELECT se.id, se.signer_id, s.signer_role, s.name_encrypted,
                se.signature_method, se.signature_storage_key,
                se.presented_document_hash, se.signed_at
         FROM signature_events se JOIN signers s ON s.id = se.signer_id
         WHERE se.envelope_id = ? ORDER BY se.signed_at, se.id`,
        [session.envelope_id],
      );
      for (const event of pastEvents) {
        const encrypted = Buffer.from(
          await readPrivateObject(event.signature_storage_key),
        ).toString('utf8');
        const content = decryptValue(encrypted, `signature:${event.id}`);
        pdf = await appendSignatureEvidence(pdf, {
          name: decryptValue(
            event.name_encrypted,
            `signer:${event.signer_id}:name`,
          ),
          role: event.signer_role,
          signedAt: fromMysqlUtc(event.signed_at).toISOString(),
          presentedHash: event.presented_document_hash,
          method: event.signature_method,
          png:
            event.signature_method === 'drawn'
              ? new Uint8Array(Buffer.from(content.split(',')[1], 'base64'))
              : undefined,
        });
      }
    } else {
      const overlayValues = Object.fromEntries(
        Object.entries(newValues).filter(
          ([name]) => allowed.get(name)?.field_type !== 'signature' || !png,
        ),
      );
      pdf = await fillPdf(pdf, assigned.map(toTemplateField), overlayValues);
      if (png)
        pdf = await drawSignatureImages(
          pdf,
          assigned.map(toTemplateField),
          png,
        );
    }
    const signedAt = new Date().toISOString();
    pdf = await appendSignatureEvidence(pdf, {
      name: signerName,
      role: session.signer_role,
      signedAt,
      presentedHash: input.presentedHash,
      method: input.method,
      png: png ?? undefined,
    });
    const eventId = randomUUID();
    signatureKey = await storePrivateObject(
      'signatures',
      session.envelope_id,
      'enc',
      Buffer.from(
        encryptValue(
          input.method === 'drawn' ? input.drawnPng! : signatureText,
          `signature:${eventId}`,
        ),
        'utf8',
      ),
    );
    documentKey = await storePrivateObject(
      'documents',
      session.envelope_id,
      'pdf',
      pdf,
    );
    if (sha256(await readPrivateObject(documentKey)) !== sha256(pdf))
      throw new Error('Signed document failed storage verification.');
    await connection.execute(
      `UPDATE signers SET status = 'signed', signed_at = ?, token_used_at = ?
       WHERE id = ? AND token_used_at IS NULL`,
      [toMysqlDate(signedAt), toMysqlDate(signedAt), signer.id],
    );
    const status = await refreshEnvelopeStatus(
      connection,
      session.envelope_id,
      envelope.status,
    );
    await connection.execute(
      `INSERT INTO document_versions
       (id, envelope_id, version_kind, source_hash, document_hash, storage_key, byte_length, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [
        randomUUID(),
        session.envelope_id,
        status === 'completed' ? 'final' : 'intermediate',
        template.source_hash,
        sha256(pdf),
        documentKey,
        pdf.length,
      ],
    );
    await connection.execute(
      `INSERT INTO signature_events
       (id, envelope_id, signer_id, signature_method, signature_storage_key,
        presented_document_hash, ip_address_encrypted, user_agent,
        consent_text_version, submission_hash, signed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        session.envelope_id,
        signer.id,
        input.method,
        signatureKey,
        input.presentedHash,
        encryptValue(
          getClientIp(request) ?? 'unavailable',
          `signature:${eventId}:ip`,
        ),
        encryptValue(
          request.headers.get('user-agent') ?? 'unavailable',
          `signature:${eventId}:ua`,
        ),
        CONSENT_VERSION,
        submissionHash,
        toMysqlDate(signedAt),
      ],
    );
    await connection.execute(
      `UPDATE signer_sessions SET revoked_at = UTC_TIMESTAMP(6)
       WHERE signer_id = ? AND id <> ? AND revoked_at IS NULL`,
      [signer.id, session.session_id],
    );
    await appendAuditEventInTransaction(connection, {
      actorType: 'signer',
      actorId: signer.id,
      envelopeId: session.envelope_id,
      eventType: 'DOCUMENT_SIGNED',
      details: {
        presentedHash: input.presentedHash,
        documentHash: sha256(pdf),
        signatureMethod: input.method,
        consentVersion: CONSENT_VERSION,
        status,
      },
      userAgent: encryptValue(
        request.headers.get('user-agent') ?? 'unavailable',
        `envelope:${session.envelope_id}:audit_ua`,
      ),
    });
    await connection.commit();
    let archivePending = false;
    if (status === 'completed') {
      try {
        await finalizeCompletedEnvelope(session.envelope_id);
      } catch {
        archivePending = true;
      }
    }
    return { status, documentHash: sha256(pdf), archivePending };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (signatureKey)
      await removePrivateObject(signatureKey).catch(() => undefined);
    if (documentKey)
      await removePrivateObject(documentKey).catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}
