import type { RowDataPacket } from 'mysql2/promise';
import { getMysqlPool } from '../../lib/mysql';
import { saveDraft, validateEnvelopeInput } from '../../lib/envelopes';
import { appendAuditEvent } from '../../lib/audit';

const pool = getMysqlPool();
try {
  const [admins] = await pool.query<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM users WHERE role='admin' AND status='active' LIMIT 1",
  );
  if (!admins[0]) throw new Error('No active administrator');
  const [templates] = await pool.query<Array<RowDataPacket & { id: string }>>(
    "SELECT v.id FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE t.slug='med-training-completion' AND v.lifecycle='active' LIMIT 1",
  );
  if (!templates[0]) throw new Error('No active training template');
  const title = '[TEST] Medication Training Completion - synthetic signers';
  const [existing] = await pool.query<
    Array<RowDataPacket & { id: string; status: string }>
  >(
    'SELECT id,status FROM envelopes WHERE title=? ORDER BY created_at DESC LIMIT 1',
    [title],
  );
  if (existing[0]) {
    console.log(
      JSON.stringify({
        id: existing[0].id,
        status: existing[0].status,
        created: false,
      }),
    );
  } else {
    const input = validateEnvelopeInput({
      templateVersionId: templates[0].id,
      title,
      routingMode: 'ordered',
      expiresInDays: 7,
      reminderDays: [],
      adminValues: {},
      recipients: [
        {
          role: 'non_licensed_staff',
          name: 'Test Staff',
          email: 'akwaed@gmail.com',
        },
        {
          role: 'rn_trainer',
          name: 'Test RN Trainer',
          email: 'akwaed@gmail.com',
        },
      ],
    });
    const id = await saveDraft(input, admins[0].id);
    await appendAuditEvent({
      actorType: 'system',
      envelopeId: id,
      eventType: 'DOCUMENT_DRAFT_CREATED',
      details: {
        templateVersionId: templates[0].id,
        purpose: 'synthetic SMTP invitation test',
      },
    });
    console.log(JSON.stringify({ id, status: 'draft', created: true }));
  }
} finally {
  await pool.end();
}
