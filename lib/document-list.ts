import 'server-only';

import type { RowDataPacket } from 'mysql2/promise';

import type { AccessUser } from '@/lib/auth/rbac';
import { buildDocumentListQuery } from '@/lib/document-query';
import type { DashboardStatus } from '@/lib/document-status';
import { decryptValue } from '@/lib/encryption';
import { getMysqlPool } from '@/lib/mysql';
import { recipientEmailIndex } from '@/lib/recipient-index';
import { classifyDocumentSearch } from '@/lib/recipient-index';

export type DocumentListRow = {
  id: string;
  title: string;
  templateName: string;
  versionNumber: number;
  employeeName: string;
  recipientName: string;
  recipientEmail: string;
  extraRecipients: number;
  sentAt: string | null;
  viewedAt: string | null;
  completedAt: string | null;
  status: DashboardStatus;
};

type SqlRow = RowDataPacket & {
  id: string;
  title: string;
  employee_name: string;
  template_name: string;
  version_number: number;
  sent_at: string | null;
  viewed_at: string | null;
  completed_at: string | null;
  recipient_id: string | null;
  recipient_name_encrypted: string | null;
  recipient_email_encrypted: string | null;
  recipient_count: number;
  dashboard_status: DashboardStatus;
};

export async function backfillRecipientEmailIndex(limit = 200) {
  const secret = process.env.IP_HASH_SECRET;
  if (!secret) return 0;
  const [rows] = await getMysqlPool().query<
    Array<RowDataPacket & { id: string; email_encrypted: string }>
  >(
    'SELECT id, email_encrypted FROM signers WHERE email_lookup IS NULL LIMIT ?',
    [limit],
  );
  let updated = 0;
  for (const row of rows) {
    try {
      const email = decryptValue(row.email_encrypted, `signer:${row.id}:email`);
      await getMysqlPool().execute(
        'UPDATE signers SET email_lookup = ? WHERE id = ? AND email_lookup IS NULL',
        [recipientEmailIndex(email, secret), row.id],
      );
      updated += 1;
    } catch {
      // Leave an unreadable row unindexed rather than storing plaintext.
    }
  }
  return updated;
}

export async function listDocuments(
  user: AccessUser,
  filters: {
    q?: string;
    status?: string;
    from?: string;
    to?: string;
    employeeId?: string;
    templateId?: string;
    sort?: string;
    direction?: string;
    page?: number;
  },
) {
  await backfillRecipientEmailIndex();
  const search = classifyDocumentSearch(filters.q ?? '');
  const secret = process.env.IP_HASH_SECRET ?? '';
  const emailIndex =
    search.email && secret ? recipientEmailIndex(search.email, secret) : null;
  const query = buildDocumentListQuery({ ...filters, user, emailIndex });
  const [countRows] = await getMysqlPool().query<
    Array<RowDataPacket & { total: number }>
  >(query.countSql, query.countParams);
  const [rows] = await getMysqlPool().query<SqlRow[]>(query.sql, query.params);
  return {
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    direction: query.direction,
    total: Number(countRows[0]?.total ?? 0),
    rows: rows.map(presentRow),
  };
}

function presentRow(row: SqlRow): DocumentListRow {
  const count = Number(row.recipient_count ?? 0);
  let recipientName = '';
  let recipientEmail = '';
  if (row.recipient_id && row.recipient_name_encrypted)
    recipientName = decryptValue(
      row.recipient_name_encrypted,
      `signer:${row.recipient_id}:name`,
    );
  if (row.recipient_id && row.recipient_email_encrypted)
    recipientEmail = decryptValue(
      row.recipient_email_encrypted,
      `signer:${row.recipient_id}:email`,
    );
  return {
    id: row.id,
    title: row.title,
    templateName: row.template_name,
    versionNumber: Number(row.version_number),
    employeeName: row.employee_name,
    recipientName,
    recipientEmail,
    extraRecipients: Math.max(0, count - 1),
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    completedAt: row.completed_at,
    status: row.dashboard_status,
  };
}
