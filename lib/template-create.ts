import 'server-only';

import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { formText } from '@/lib/form-data';
import { getMysqlPool } from '@/lib/mysql';
import { readPrivateObject, storePrivateObject } from '@/lib/private-storage';
import { sanitizeTemplatePdf } from '@/lib/pdf-sanitize';
import { sha256 } from '@/lib/template-files';
import { assertDraftMutable } from '@/lib/template-permissions';

export async function createPdfTemplate(form: FormData, actorId: string) {
  const name = formText(form, 'name').trim().slice(0, 255);
  const roles = formText(form, 'roles')
    .split(',')
    .map((role) => role.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter((role) => /^[a-z][a-z0-9_]{0,40}$/.test(role));
  if (!name) throw new Error('Give the template a name.');
  if (!roles.length)
    throw new Error('Add at least one recipient role, such as signer.');
  const file = form.get('file');
  if (!(file instanceof File)) throw new Error('Choose a PDF file.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const clean = await sanitizeTemplatePdf(bytes);
  const hash = sha256(clean.bytes);
  const templateId = randomUUID();
  const versionId = randomUUID();
  const slug = `pdf-${templateId.slice(0, 8)}`;
  const storageKey = await storePrivateObject(
    'templates',
    versionId,
    'pdf',
    clean.bytes,
  );
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute<ResultSetHeader>(
      `INSERT INTO templates
        (id, slug, name, source_type, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'pdf', 'draft', ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
      [templateId, slug, name, actorId],
    );
    await connection.execute<ResultSetHeader>(
      `INSERT INTO template_versions
        (id, template_id, version_number, source_hash, source_storage_key, page_count,
         layout_strategy, coordinate_space, signer_plan_json, lifecycle, created_at)
       VALUES (?, ?, 1, ?, ?, ?, 'pdf_overlay', 'pdf_points', ?, 'draft', UTC_TIMESTAMP(6))`,
      [
        versionId,
        templateId,
        hash,
        storageKey,
        clean.pageCount,
        JSON.stringify(
          roles.map((role, index) => ({
            role,
            order: index + 1,
            required: true,
          })),
        ),
      ],
    );
    await connection.commit();
    return { templateId, versionId, slug, pageCount: clean.pageCount, hash };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function duplicateTemplateVersion(versionId: string) {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [versions] = await connection.query<
      Array<
        RowDataPacket & {
          id: string;
          template_id: string;
          source_hash: string;
          source_storage_key: string;
          page_count: number;
          layout_strategy: string;
          coordinate_space: 'grid1000' | 'pdf_points';
          signer_plan_json: unknown;
          lifecycle: string;
        }
      >
    >('SELECT * FROM template_versions WHERE id = ? FOR UPDATE', [versionId]);
    const source = versions[0];
    if (!source) throw new Error('Template version not found.');
    if (source.layout_strategy === 'docx_merge')
      throw new Error('Duplicate the PDF templates in the visual editor.');
    const bytes = await readPrivateObject(source.source_storage_key);
    if (sha256(bytes) !== source.source_hash)
      throw new Error('Template source failed SHA-256 verification.');
    const [numbers] = await connection.query<
      Array<RowDataPacket & { next_number: number }>
    >(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_number FROM template_versions WHERE template_id = ?',
      [source.template_id],
    );
    const nextId = randomUUID();
    const storageKey = await storePrivateObject(
      'templates',
      nextId,
      'pdf',
      bytes,
    );
    await connection.execute<ResultSetHeader>(
      `INSERT INTO template_versions
        (id, template_id, version_number, source_hash, source_storage_key, page_count,
         layout_strategy, coordinate_space, signer_plan_json, lifecycle, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pdf_overlay', ?, ?, 'draft', UTC_TIMESTAMP(6))`,
      [
        nextId,
        source.template_id,
        Number(numbers[0]?.next_number ?? 1),
        source.source_hash,
        storageKey,
        source.page_count,
        source.coordinate_space ?? 'grid1000',
        JSON.stringify(source.signer_plan_json),
      ],
    );
    const [fields] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM template_fields WHERE template_version_id = ? ORDER BY display_order',
      [source.id],
    );
    for (const field of fields) {
      await connection.execute(
        `INSERT INTO template_fields
          (id, template_version_id, field_name, label, field_type, populated_by,
           signer_role, group_key, options_json, date_format, page_number, x, y, width, height, required, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          nextId,
          field.field_name,
          field.label,
          field.field_type,
          field.populated_by,
          field.signer_role,
          field.group_key,
          field.options_json ? JSON.stringify(field.options_json) : null,
          field.date_format,
          field.page_number,
          field.x,
          field.y,
          field.width,
          field.height,
          field.required,
          field.display_order,
        ],
      );
    }
    assertDraftMutable('draft');
    await connection.commit();
    return {
      versionId: nextId,
      versionNumber: Number(numbers[0]?.next_number ?? 1),
      sourceVersionId: source.id,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
