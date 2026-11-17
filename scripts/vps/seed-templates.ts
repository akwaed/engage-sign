import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { templateCatalog } from '../../lib/template-catalog';
import { baselinePdfFields } from '../../lib/baseline-pdf-fields';
import { getMysqlPool } from '../../lib/mysql';
import {
  storeTemplateVersion,
  readTemplateVersion,
} from '../../lib/private-storage';
import {
  inspectTemplate,
  sha256,
  type TemplateField,
} from '../../lib/template-files';
import { appendAuditEvent } from '../../lib/audit';
import { convertDocxToPdf } from '../../lib/docx-convert';

const source = process.argv[2];
const revisions = process.argv[3];
if (!source || !revisions)
  throw new Error('Provide baseline and revision directories.');
const pool = getMysqlPool();
try {
  const [existing] = await pool.query('SELECT id FROM envelopes LIMIT 1');
  if ((existing as unknown[]).length)
    throw new Error('Envelopes exist; seeding is restricted to initial setup.');
  // Verify all original hashes before making any changes.
  for (const item of templateCatalog) {
    if (
      sha256(
        new Uint8Array(await readFile(join(source, item.sourceFilename))),
      ) !== item.sourceHash
    )
      throw new Error(`Baseline hash mismatch: ${item.id}`);
  }
  for (const item of templateCatalog) {
    const [templates] = await pool.query<Array<RowDataPacket & { id: string }>>(
      'SELECT id FROM templates WHERE slug=?',
      [item.id],
    );
    const templateId = templates[0]?.id ?? randomUUID();
    if (!templates.length)
      await pool.execute(
        `INSERT INTO templates (id,slug,name,source_type,status,created_by,created_at,updated_at) VALUES (?,?,?,?,'draft',NULL,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))`,
        [templateId, item.id, item.name, item.sourceType],
      );
    const variants =
      item.sourceType === 'docx' ? [source, revisions] : [source];
    for (const [index, folder] of variants.entries()) {
      const bytes = new Uint8Array(
        await readFile(join(folder, item.sourceFilename)),
      );
      const inspection = await inspectTemplate(bytes, item.sourceType);
      const [versions] = await pool.query<
        Array<
          RowDataPacket & {
            id: string;
            source_storage_key: string;
            source_hash: string;
            lifecycle: string;
          }
        >
      >(
        'SELECT id,source_storage_key,source_hash,lifecycle FROM template_versions WHERE template_id=? AND version_number=?',
        [templateId, index + 1],
      );
      if (
        versions[0] &&
        (versions[0].lifecycle !== 'draft' ||
          versions[0].source_hash !== sha256(bytes))
      )
        throw new Error('Existing version does not match fresh seed.');
      const versionId = versions[0]?.id ?? randomUUID();
      const key =
        versions[0]?.source_storage_key ??
        (await storeTemplateVersion(versionId, item.sourceType, bytes));
      if (sha256(await readTemplateVersion(key)) !== sha256(bytes))
        throw new Error('Storage hash mismatch');
      if (!versions.length)
        await pool.execute(
          `INSERT INTO template_versions (id,template_id,version_number,source_hash,source_storage_key,page_count,layout_strategy,signer_plan_json,lifecycle,created_at) VALUES (?,?,?,?,?,?,?,?,'draft',UTC_TIMESTAMP(6))`,
          [
            versionId,
            templateId,
            index + 1,
            sha256(bytes),
            key,
            inspection.pageCount ?? item.pages,
            item.layoutStrategy,
            JSON.stringify(item.signers),
          ],
        );
      const fields: TemplateField[] =
        item.sourceType === 'pdf'
          ? (baselinePdfFields[item.id] ?? [])
          : index === 1
            ? JSON.parse(
                await readFile(
                  join(revisions, `${item.id}.fields.json`),
                  'utf8',
                ),
              )
            : [];
      await pool.execute(
        'DELETE FROM template_fields WHERE template_version_id=?',
        [versionId],
      );
      for (const [order, field] of fields.entries()) {
        await pool.execute(
          `INSERT INTO template_fields (id,template_version_id,field_name,label,field_type,populated_by,signer_role,page_number,x,y,width,height,required,display_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            randomUUID(),
            versionId,
            field.fieldName,
            field.label,
            field.fieldType,
            field.populatedBy.replace('-fill', ''),
            field.signerRole,
            field.pageNumber,
            field.x,
            field.y,
            field.width,
            field.height,
            field.required,
            order,
          ],
        );
      }
      if (item.sourceType === 'docx') {
        const pdf = await convertDocxToPdf(bytes);
        const previewDir = join(source, 'conversion-checks');
        await mkdir(previewDir, { recursive: true, mode: 0o700 });
        await writeFile(join(previewDir, `${item.id}-v${index + 1}.pdf`), pdf, {
          mode: 0o600,
        });
        console.log(`Verified conversion: ${item.id} v${index + 1}`);
      }
      await appendAuditEvent({
        actorType: 'system',
        eventType: 'VPS_TEMPLATE_IMPORTED',
        details: {
          slug: item.id,
          versionId,
          sourceHash: sha256(bytes),
          fields: fields.length,
          lifecycle: 'draft',
        },
      });
    }
  }
  console.log(
    'Imported nine templates and six mapped Word revisions as drafts.',
  );
} finally {
  await pool.end();
}
