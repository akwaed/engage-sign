import type { RowDataPacket } from 'mysql2/promise';

import { getStaffUser } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';
import { assertSameOrigin } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CountRow = RowDataPacket & { count: number };

async function count(sql: string, values: string[] = []) {
  const [rows] = await getMysqlPool().query<CountRow[]>(sql, values);
  return Number(rows[0]?.count ?? 0);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const actor = await getStaffUser();
  if (!actor || actor.role !== 'admin')
    return Response.json({ error: 'Administrator access is required.' }, { status: 403 });

  try {
    const pool = getMysqlPool();
    const existingTables = await count(
      'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?, ?, ?)',
      ['envelopes', 'document_versions', 'notification_outbox'],
    );
    if (existingTables !== 3 ||
        await count('SELECT COUNT(*) AS count FROM users') < 1 ||
        await count('SELECT COUNT(*) AS count FROM template_versions') < 9)
      throw new Error('Expected users, template versions, and signing tables are missing.');
    const before = {
      users: await count('SELECT COUNT(*) AS count FROM users'),
      templates: await count('SELECT COUNT(*) AS count FROM templates'),
      versions: await count('SELECT COUNT(*) AS count FROM template_versions'),
      fields: await count('SELECT COUNT(*) AS count FROM template_fields'),
      audit: await count('SELECT COUNT(*) AS count FROM audit_events'),
    };

    if (await count(
      'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      ['final_archives'],
    ) === 0) {
      await pool.query(`CREATE TABLE final_archives (
        id CHAR(36) PRIMARY KEY,
        envelope_id CHAR(36) NOT NULL,
        final_document_id CHAR(36) NOT NULL,
        final_document_hash CHAR(64) NOT NULL,
        certificate_hash CHAR(64) NOT NULL,
        archive_hash CHAR(64) NOT NULL,
        storage_key VARCHAR(1024) NOT NULL,
        byte_length BIGINT UNSIGNED NOT NULL,
        created_at DATETIME(6) NOT NULL,
        UNIQUE KEY final_archives_envelope_unique (envelope_id),
        CONSTRAINT final_archives_envelope_fk FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE CASCADE,
        CONSTRAINT final_archives_document_fk FOREIGN KEY (final_document_id) REFERENCES document_versions(id)
      ) ENGINE=InnoDB`);
    }
    const columns = [
      ['next_attempt_at', 'DATETIME(6) NULL AFTER claimed_at'],
      ['last_attempt_at', 'DATETIME(6) NULL AFTER next_attempt_at'],
      ['provider_response', 'VARCHAR(255) NULL AFTER sent_at'],
      ['last_error_code', 'VARCHAR(80) NULL AFTER provider_response'],
    ] as const;
    for (const [name, definition] of columns) {
      if (await count(
        'SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
        ['notification_outbox', name],
      ) === 0)
        await pool.query(`ALTER TABLE notification_outbox ADD COLUMN ${name} ${definition}`);
    }
    if (await count(
      'SELECT COUNT(*) AS count FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
      ['notification_outbox', 'notification_outbox_retry_idx'],
    ) === 0)
      await pool.query('ALTER TABLE notification_outbox ADD KEY notification_outbox_retry_idx (status, next_attempt_at)');

    const after = {
      users: await count('SELECT COUNT(*) AS count FROM users'),
      templates: await count('SELECT COUNT(*) AS count FROM templates'),
      versions: await count('SELECT COUNT(*) AS count FROM template_versions'),
      fields: await count('SELECT COUNT(*) AS count FROM template_fields'),
      audit: await count('SELECT COUNT(*) AS count FROM audit_events'),
    };
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('Existing row counts changed during migration verification.');
    return Response.json({ ok: true, migration: '003', before, after });
  } catch {
    return Response.json({ error: 'Migration 003 did not complete; inspect database schema before retrying.' }, { status: 500 });
  }
}
