import { writeFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { readPrivateObject } from '../../lib/private-storage';
import { fillPdf, sha256, type TemplateField } from '../../lib/template-files';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
try {
  const [versions] = await pool.query<
    Array<
      mysql.RowDataPacket & {
        source_storage_key: string;
        source_hash: string;
        id: string;
      }
    >
  >(
    'SELECT v.id, v.source_storage_key, v.source_hash FROM template_versions v JOIN templates t ON t.id = v.template_id WHERE t.slug = ? AND v.version_number = 1',
    ['med-training-completion'],
  );
  const version = versions[0];
  if (!version) throw new Error('Template not found');
  const bytes = await readPrivateObject(version.source_storage_key);
  if (sha256(bytes) !== version.source_hash)
    throw new Error('Source hash changed');
  const [rows] = await pool.query<
    Array<
      mysql.RowDataPacket & {
        field_name: string;
        label: string;
        field_type: TemplateField['fieldType'];
        populated_by: string;
        signer_role: string;
        page_number: number;
        x: number;
        y: number;
        width: number;
        height: number;
        required: number;
      }
    >
  >(
    'SELECT * FROM template_fields WHERE template_version_id = ? ORDER BY display_order',
    [version.id],
  );
  const fields: TemplateField[] = rows.map((r) => ({
    fieldName: r.field_name,
    label: r.label,
    fieldType: r.field_type,
    populatedBy:
      r.populated_by === 'admin'
        ? 'admin-fill'
        : r.populated_by === 'participant'
          ? 'participant-fill'
          : (r.populated_by as TemplateField['populatedBy']),
    signerRole: r.signer_role,
    pageNumber: r.page_number,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    required: Boolean(r.required),
  }));
  const filled = await fillPdf(bytes, fields, {
    staff_signature: 'SAMPLE STAFF',
    staff_date: '09/23/2026',
    rn_signature: 'SAMPLE RN',
  });
  await writeFile(
    '/var/lib/engage-sign-vps/imports/conversion-checks/med-training-sample.pdf',
    filled,
  );
  console.log(
    JSON.stringify({
      versionId: version.id,
      fields: fields.length,
      sourceHash: version.source_hash,
      outputBytes: filled.length,
    }),
  );
} finally {
  await pool.end();
}
