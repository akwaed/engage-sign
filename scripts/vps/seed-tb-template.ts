import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEventInTransaction } from '../../lib/audit';
import { getMysqlPool } from '../../lib/mysql';
import { sanitizeTemplatePdf } from '../../lib/pdf-sanitize';
import { storePrivateObject } from '../../lib/private-storage';
import { sha256 } from '../../lib/template-files';
import {
  TB_FIELDS,
  TB_FORM_SOURCE,
  TB_TEMPLATE_SLUG,
  tbSeedRefusal,
} from '../../lib/tb-form';

const refusal = tbSeedRefusal(process.env, process.argv.slice(2));
if (refusal) throw new Error(refusal);

const fixture = new URL(
  '../../fixtures/templates/ky-dph-tb-4.pdf',
  import.meta.url,
);
const clean = await sanitizeTemplatePdf(
  new Uint8Array(await readFile(fixture)),
);
const hash = sha256(clean.bytes);
const pool = getMysqlPool();
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  const [existing] = await connection.query<
    Array<RowDataPacket & { id: string }>
  >('SELECT id FROM templates WHERE slug = ? LIMIT 1', [TB_TEMPLATE_SLUG]);
  if (existing[0]) {
    await connection.rollback();
    console.log(`TB-4 template already exists: ${existing[0].id}`);
    process.exit(0);
  }
  const [admins] = await connection.query<
    Array<RowDataPacket & { id: string }>
  >(
    `SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1`,
  );
  const actorId = admins[0]?.id;
  if (!actorId)
    throw new Error('Create an administrator before seeding the TB template.');
  const templateId = randomUUID();
  const versionId = randomUUID();
  const storageKey = await storePrivateObject(
    'templates',
    versionId,
    'pdf',
    clean.bytes,
  );
  await connection.execute<ResultSetHeader>(
    `INSERT INTO templates
      (id, slug, name, source_type, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'pdf', 'draft', ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
    [
      templateId,
      TB_TEMPLATE_SLUG,
      `${TB_FORM_SOURCE.title} (${TB_FORM_SOURCE.formNumber})`,
      actorId,
    ],
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
      JSON.stringify([{ role: 'patient', order: 1, required: true }]),
    ],
  );
  for (const [index, item] of TB_FIELDS.entries()) {
    await connection.execute<ResultSetHeader>(
      `INSERT INTO template_fields
        (id, template_version_id, field_name, label, field_type, populated_by, signer_role,
         group_key, date_format, page_number, x, y, width, height, required, display_order)
       VALUES (?, ?, ?, ?, ?, 'signer', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        versionId,
        item.fieldName,
        item.label.slice(0, 255),
        item.fieldType,
        item.signerRole,
        item.groupKey,
        item.dateFormat,
        item.pageNumber,
        item.x,
        item.y,
        item.width,
        item.height,
        item.required ? 1 : 0,
        index,
      ] as Array<string | number | null>,
    );
  }
  await appendAuditEventInTransaction(connection, {
    actorType: 'user',
    actorId,
    eventType: 'TEMPLATE_CREATED',
    details: {
      slug: TB_TEMPLATE_SLUG,
      versionId,
      source: TB_FORM_SOURCE.sourceUrl,
    },
  });
  await connection.execute(
    `UPDATE template_versions
        SET lifecycle = 'active', activated_at = UTC_TIMESTAMP(6)
      WHERE id = ?`,
    [versionId],
  );
  await connection.execute(
    `UPDATE templates SET status = 'active', updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
    [templateId],
  );
  await appendAuditEventInTransaction(connection, {
    actorType: 'user',
    actorId,
    eventType: 'TEMPLATE_PUBLISHED',
    details: { slug: TB_TEMPLATE_SLUG, versionId, versionNumber: 1 },
  });
  await connection.commit();
  console.log(`Published TB-4 template ${templateId} version ${versionId}`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
