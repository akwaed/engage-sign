import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import { baselinePdfFields } from '@/lib/baseline-pdf-fields';
import { getStaffUser } from '@/lib/auth/session';
import { formText } from '@/lib/form-data';
import { getMysqlPool } from '@/lib/mysql';
import {
  removeTemplateVersion,
  readTemplateVersion,
  storeTemplateVersion,
} from '@/lib/private-storage';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';
import { templateCatalog } from '@/lib/template-catalog';
import {
  inspectTemplate,
  sha256,
  type TemplateField,
} from '@/lib/template-files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type VersionRow = RowDataPacket & {
  id: string;
  template_id: string;
  source_hash: string;
  source_storage_key: string;
  layout_strategy: 'docx_merge' | 'pdf_overlay';
  page_count: number;
  lifecycle: 'draft' | 'active' | 'retired';
  signer_plan_json: string | Array<{ role: string }>;
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const actor = await getStaffUser();
  if (!actor || actor.role !== 'admin')
    return Response.json(
      { error: 'Administrator access is required.' },
      { status: 403 },
    );

  try {
    const form = await request.formData();
    const action = formText(form, 'action');
    let event = '';
    let details: Record<string, unknown> = {};
    if (action === 'upload') {
      details = await upload(form, actor.id);
      event = 'TEMPLATE_VERSION_UPLOADED';
    } else if (action === 'map') {
      details = await mapFields(form);
      event = 'TEMPLATE_FIELDS_MAPPED';
    } else if (
      action === 'activate' ||
      action === 'rollback' ||
      action === 'retire'
    ) {
      details = await changeLifecycle(form, action);
      event = `TEMPLATE_VERSION_${action.toUpperCase()}`;
    } else {
      return Response.json(
        { error: 'Unknown template action.' },
        { status: 400 },
      );
    }
    await appendAuditEvent({
      actorType: 'user',
      actorId: actor.id,
      eventType: event,
      details,
      ipHash: hashClientIp(getClientIp(request)),
      userAgent: request.headers.get('user-agent'),
    });
    return Response.json({ ok: true, ...details });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Template operation failed.',
      },
      { status: 400 },
    );
  }
}

async function upload(form: FormData, actorId: string) {
  const slug = formText(form, 'slug');
  const catalog = templateCatalog.find((item) => item.id === slug);
  if (!catalog) throw new Error('Choose one of the nine catalog templates.');
  const file = form.get('file');
  if (!(file instanceof File)) throw new Error('Choose a DOCX or PDF file.');
  if (
    file.name !== catalog.sourceFilename &&
    formText(form, 'kind') === 'baseline'
  )
    throw new Error(`Baseline filename must be ${catalog.sourceFilename}.`);
  const extension = file.name.toLowerCase().endsWith('.docx')
    ? 'docx'
    : file.name.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : null;
  if (!extension || extension !== catalog.sourceType)
    throw new Error(
      `This catalog item requires a ${catalog.sourceType.toUpperCase()} file.`,
    );
  if (file.size > 20 * 1024 * 1024) throw new Error('File exceeds 20 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspection = await inspectTemplate(bytes, extension);
  const hash = sha256(bytes);
  const pool = getMysqlPool();
  const connection = await pool.getConnection();
  const versionId = randomUUID();
  let storageKey: string | null = null;
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query<
      Array<RowDataPacket & { id: string }>
    >('SELECT id FROM templates WHERE slug = ? FOR UPDATE', [slug]);
    const templateId = existing[0]?.id ?? randomUUID();
    const [versions] = await connection.query<
      Array<RowDataPacket & { next_number: number }>
    >(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_number FROM template_versions WHERE template_id = ?',
      [templateId],
    );
    const number = Number(versions[0]?.next_number ?? 1);
    if (number === 1 && hash !== catalog.sourceHash)
      throw new Error(
        'First import does not match the catalog SHA-256 hash. Upload the exact baseline source.',
      );
    if (formText(form, 'kind') === 'baseline' && hash !== catalog.sourceHash)
      throw new Error('The baseline SHA-256 hash does not match the catalog.');
    storageKey = await storeTemplateVersion(versionId, extension, bytes);
    const stored = await readTemplateVersion(storageKey);
    if (sha256(stored) !== hash)
      throw new Error('Stored file failed SHA-256 verification.');
    if (!existing[0]) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO templates (id, slug, name, source_type, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
        [templateId, slug, catalog.name, extension, actorId],
      );
    }
    await connection.execute<ResultSetHeader>(
      `INSERT INTO template_versions
       (id, template_id, version_number, source_hash, source_storage_key, page_count,
        layout_strategy, signer_plan_json, lifecycle, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', UTC_TIMESTAMP(6))`,
      [
        versionId,
        templateId,
        number,
        hash,
        storageKey,
        inspection.pageCount ?? catalog.pages,
        catalog.layoutStrategy,
        JSON.stringify(catalog.signers),
      ],
    );
    if (hash === catalog.sourceHash && extension === 'pdf') {
      const fields = baselinePdfFields[slug] ?? [];
      for (const [index, field] of fields.entries()) {
        await connection.execute<ResultSetHeader>(
          `INSERT INTO template_fields
           (id, template_version_id, field_name, label, field_type, populated_by,
            signer_role, page_number, x, y, width, height, required, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            versionId,
            field.fieldName,
            field.label,
            field.fieldType,
            toDbPopulatedBy(field.populatedBy),
            field.signerRole,
            field.pageNumber,
            field.x,
            field.y,
            field.width,
            field.height,
            field.required,
            index,
          ],
        );
      }
    }
    await connection.commit();
    return {
      slug,
      versionId,
      versionNumber: number,
      hash,
      baselineMatch: hash === catalog.sourceHash,
      placeholders: inspection.placeholders,
    };
  } catch (error) {
    await connection.rollback();
    if (storageKey)
      await removeTemplateVersion(storageKey).catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

async function mapFields(form: FormData) {
  const versionId = formText(form, 'versionId');
  const pool = getMysqlPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<VersionRow[]>(
      'SELECT * FROM template_versions WHERE id = ? FOR UPDATE',
      [versionId],
    );
    const version = rows[0];
    if (!version || version.lifecycle !== 'draft')
      throw new Error('Only draft versions can be mapped.');
    const fields = parseFields(formText(form, 'fields'), version);
    await connection.execute(
      'DELETE FROM template_fields WHERE template_version_id = ?',
      [versionId],
    );
    for (const [index, field] of fields.entries()) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO template_fields
         (id, template_version_id, field_name, label, field_type, populated_by,
          signer_role, page_number, x, y, width, height, required, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          versionId,
          field.fieldName,
          field.label,
          field.fieldType,
          toDbPopulatedBy(field.populatedBy),
          field.signerRole,
          field.pageNumber,
          field.x,
          field.y,
          field.width,
          field.height,
          field.required,
          index,
        ],
      );
    }
    await connection.commit();
    return { versionId, fieldCount: fields.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function changeLifecycle(form: FormData, action: string) {
  const versionId = formText(form, 'versionId');
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [versions] = await connection.query<VersionRow[]>(
      'SELECT * FROM template_versions WHERE id = ?',
      [versionId],
    );
    const version = versions[0];
    if (!version) throw new Error('Version not found.');
    await connection.query('SELECT id FROM templates WHERE id = ? FOR UPDATE', [
      version.template_id,
    ]);
    if (action === 'retire') {
      if (version.lifecycle !== 'active')
        throw new Error('Only the active version can be retired.');
      await connection.execute(
        `UPDATE template_versions SET lifecycle = 'retired', retired_at = UTC_TIMESTAMP(6) WHERE id = ?`,
        [versionId],
      );
      await connection.execute(
        `UPDATE templates SET status = 'archived', updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
        [version.template_id],
      );
    } else {
      if (version.lifecycle === 'active')
        throw new Error('This version is already active.');
      if (action === 'rollback' && version.lifecycle !== 'retired')
        throw new Error('Rollback requires a previously retired version.');
      const [fieldRows] = await connection.query<
        Array<
          RowDataPacket & {
            field_type: string;
            signer_role: string;
            page_number: number | null;
            x: number | null;
            y: number | null;
            width: number | null;
            height: number | null;
            field_name: string;
          }
        >
      >(
        'SELECT field_type, signer_role, page_number, x, y, width, height, field_name FROM template_fields WHERE template_version_id = ?',
        [versionId],
      );
      const signerPlan =
        typeof version.signer_plan_json === 'string'
          ? JSON.parse(version.signer_plan_json)
          : version.signer_plan_json;
      if (!Array.isArray(signerPlan) || !fieldRows.length)
        throw new Error('Map signer fields before activation.');
      for (const signer of signerPlan.filter(
        (item: { required: boolean }) => item.required,
      )) {
        if (
          !fieldRows.some(
            (field) =>
              field.field_type === 'signature' &&
              field.signer_role === signer.role,
          )
        )
          throw new Error(`Missing signature field for ${signer.role}.`);
      }
      if (
        version.layout_strategy === 'pdf_overlay' &&
        fieldRows.some(
          (field) =>
            !field.page_number ||
            field.x === null ||
            field.y === null ||
            field.width === null ||
            field.height === null,
        )
      )
        throw new Error('Every PDF field needs page and box coordinates.');
      const bytes = await readTemplateVersion(version.source_storage_key);
      if (sha256(bytes) !== version.source_hash)
        throw new Error('Template source hash changed in storage.');
      if (version.layout_strategy === 'docx_merge') {
        const inspection = await inspectTemplate(bytes, 'docx');
        for (const field of fieldRows)
          if (!inspection.placeholders.includes(field.field_name))
            throw new Error(
              `DOCX placeholder {{${field.field_name}}} is missing.`,
            );
      }
      await connection.execute(
        `UPDATE template_versions SET lifecycle = 'retired', retired_at = UTC_TIMESTAMP(6)
         WHERE template_id = ? AND lifecycle = 'active'`,
        [version.template_id],
      );
      await connection.execute(
        `UPDATE template_versions SET lifecycle = 'active', activated_at = UTC_TIMESTAMP(6), retired_at = NULL WHERE id = ?`,
        [versionId],
      );
      await connection.execute(
        `UPDATE templates SET status = 'active', updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
        [version.template_id],
      );
    }
    await connection.commit();
    return { versionId, action };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function parseFields(raw: string, version: VersionRow): TemplateField[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Field mapping is invalid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length > 300)
    throw new Error('Field mapping must contain at most 300 fields.');
  const plan =
    typeof version.signer_plan_json === 'string'
      ? JSON.parse(version.signer_plan_json)
      : version.signer_plan_json;
  const roles = new Set(plan.map((item: { role: string }) => item.role));
  const names = new Set<string>();
  return parsed.map((value: unknown) => {
    const field = value as TemplateField;
    if (
      !field ||
      !/^[a-z][a-z0-9_]{0,189}$/.test(field.fieldName) ||
      names.has(field.fieldName)
    )
      throw new Error('Every field needs a unique lowercase name.');
    names.add(field.fieldName);
    if (
      typeof field.label !== 'string' ||
      !field.label ||
      field.label.length > 255 ||
      !['text', 'date', 'checkbox', 'radio', 'initials', 'signature'].includes(
        field.fieldType,
      ) ||
      !['admin-fill', 'participant-fill', 'signer', 'system'].includes(
        field.populatedBy,
      ) ||
      !roles.has(field.signerRole)
    )
      throw new Error(
        `Field ${field.fieldName} has invalid type, owner, or signer role.`,
      );
    if (version.layout_strategy === 'pdf_overlay') {
      if (
        !Number.isInteger(field.pageNumber) ||
        field.pageNumber! < 1 ||
        field.pageNumber! > version.page_count ||
        ![field.x, field.y, field.width, field.height].every(
          Number.isInteger,
        ) ||
        field.x! < 0 ||
        field.y! < 0 ||
        field.width! < 1 ||
        field.height! < 1 ||
        field.x! + field.width! > 1000 ||
        field.y! + field.height! > 1000
      )
        throw new Error(
          `Field ${field.fieldName} needs a valid page and box in 0–1000 coordinates.`,
        );
    } else {
      field.pageNumber = field.x = field.y = field.width = field.height = null;
    }
    field.required = Boolean(field.required);
    return field;
  });
}

function toDbPopulatedBy(owner: TemplateField['populatedBy']) {
  return owner === 'admin-fill'
    ? 'admin'
    : owner === 'participant-fill'
      ? 'participant'
      : owner;
}
