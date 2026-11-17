import type { RowDataPacket } from 'mysql2/promise';
import { getMysqlPool } from '../../lib/mysql';
import { appendAuditEventInTransaction } from '../../lib/audit';
import { readPrivateObject } from '../../lib/private-storage';
import { sha256 } from '../../lib/template-files';

const pool = getMysqlPool();
const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  const [rows] = await connection.query<
    Array<
      RowDataPacket & {
        id: string;
        template_id: string;
        source_hash: string;
        source_storage_key: string;
        signer_plan_json: string | Array<{ role: string; required: boolean }>;
        lifecycle: string;
      }
    >
  >(
    'SELECT v.id,v.template_id,v.source_hash,v.source_storage_key,v.signer_plan_json,v.lifecycle FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE t.slug=? AND v.version_number=1 FOR UPDATE',
    ['med-training-completion'],
  );
  const version = rows[0];
  if (!version) throw new Error('Training template version is missing');
  if (version.lifecycle === 'active') {
    await connection.rollback();
    console.log('Training template is already active.');
  } else {
    if (version.lifecycle !== 'draft')
      throw new Error('Expected a draft version');
    const [active] = await connection.query<
      Array<RowDataPacket & { id: string }>
    >('SELECT id FROM template_versions WHERE template_id=? AND lifecycle=?', [
      version.template_id,
      'active',
    ]);
    if (active.length) throw new Error('Another version is already active');
    const bytes = await readPrivateObject(version.source_storage_key);
    if (sha256(bytes) !== version.source_hash)
      throw new Error('Source hash mismatch');
    const plan =
      typeof version.signer_plan_json === 'string'
        ? (JSON.parse(version.signer_plan_json) as Array<{
            role: string;
            required: boolean;
          }>)
        : version.signer_plan_json;
    const [fields] = await connection.query<
      Array<
        RowDataPacket & {
          field_type: string;
          signer_role: string;
          page_number: number | null;
          x: number | null;
          y: number | null;
          width: number | null;
          height: number | null;
        }
      >
    >(
      'SELECT field_type,signer_role,page_number,x,y,width,height FROM template_fields WHERE template_version_id=?',
      [version.id],
    );
    if (fields.length !== 3)
      throw new Error('Expected three reviewed PDF fields');
    for (const signer of plan.filter((item) => item.required)) {
      if (
        !fields.some(
          (field) =>
            field.signer_role === signer.role &&
            field.field_type === 'signature',
        )
      )
        throw new Error('Required signer is missing a signature field');
    }
    if (
      fields.some(
        (field) =>
          !field.page_number ||
          [field.x, field.y, field.width, field.height].some(
            (value) => value === null,
          ),
      )
    )
      throw new Error('A PDF field lacks coordinates');
    await connection.execute(
      "UPDATE template_versions SET lifecycle='active',activated_at=UTC_TIMESTAMP(6) WHERE id=?",
      [version.id],
    );
    await connection.execute(
      "UPDATE templates SET status='active',updated_at=UTC_TIMESTAMP(6) WHERE id=?",
      [version.template_id],
    );
    await appendAuditEventInTransaction(connection, {
      actorType: 'system',
      eventType: 'TEMPLATE_VERSION_ACTIVATE',
      details: {
        slug: 'med-training-completion',
        versionId: version.id,
        purpose: 'synthetic mail test',
      },
    });
    await connection.commit();
    console.log(
      'Medication Training Completion v1 active for synthetic testing.',
    );
  }
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
