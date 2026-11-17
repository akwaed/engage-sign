import { canReadAllDocuments, type AccessUser } from './auth/rbac.ts';
import { DASHBOARD_STATUS_SQL, isDashboardStatus } from './document-status.ts';
import { classifyDocumentSearch } from './recipient-index.ts';

const SORTS = {
  sent: 'COALESCE(e.locked_at, e.created_at)',
  viewed: 'viewed_at',
  completed: 'e.completed_at',
  title: 'e.title',
  template: 't.name',
  status: 'dashboard_status',
} as const;

export type DocumentSort = keyof typeof SORTS;

export type DocumentListInput = {
  user: AccessUser;
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  employeeId?: string;
  templateId?: string;
  sort?: string;
  direction?: string;
  page?: number;
  emailIndex?: string | null;
};

const PAGE_SIZE = 25;

export function buildDocumentListQuery(input: DocumentListInput) {
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (!canReadAllDocuments(input.user)) {
    where.push('e.created_by = ?');
    params.push(input.user.id);
  } else if (isUuid(input.employeeId)) {
    where.push('e.created_by = ?');
    params.push(input.employeeId!);
  }
  if (isUuid(input.templateId)) {
    where.push('t.id = ?');
    params.push(input.templateId!);
  }
  const search = classifyDocumentSearch(input.q ?? '');
  if (search.email) {
    where.push(
      'EXISTS (SELECT 1 FROM signers lookup WHERE lookup.envelope_id = e.id AND lookup.email_lookup = ?)',
    );
    params.push(input.emailIndex ?? '');
  } else if (search.text) {
    const like = `%${search.text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    where.push('(e.title LIKE ? OR t.name LIKE ?)');
    params.push(like, like);
  }
  if (input.status && isDashboardStatus(input.status)) {
    where.push(`${DASHBOARD_STATUS_SQL} = ?`);
    params.push(input.status);
  }
  const from = dateBound(input.from, false);
  const to = dateBound(input.to, true);
  if (from) {
    where.push('COALESCE(e.locked_at, e.created_at) >= ?');
    params.push(from);
  }
  if (to) {
    where.push('COALESCE(e.locked_at, e.created_at) < ?');
    params.push(to);
  }
  const sort = isSort(input.sort) ? input.sort : 'sent';
  const direction = input.direction === 'asc' ? 'ASC' : 'DESC';
  const page = Math.min(10_000, Math.max(1, input.page ?? 1));
  const sql = `SELECT e.id, e.title, e.status, e.created_by, e.created_at,
      e.locked_at AS sent_at, e.completed_at,
      u.display_name AS employee_name,
      t.id AS template_id, t.name AS template_name, v.version_number,
      (SELECT MIN(viewed.viewed_at) FROM signers viewed WHERE viewed.envelope_id = e.id) AS viewed_at,
      (SELECT recipient.id FROM signers recipient WHERE recipient.envelope_id = e.id ORDER BY recipient.routing_order, recipient.id LIMIT 1) AS recipient_id,
      (SELECT recipient.name_encrypted FROM signers recipient WHERE recipient.envelope_id = e.id ORDER BY recipient.routing_order, recipient.id LIMIT 1) AS recipient_name_encrypted,
      (SELECT recipient.email_encrypted FROM signers recipient WHERE recipient.envelope_id = e.id ORDER BY recipient.routing_order, recipient.id LIMIT 1) AS recipient_email_encrypted,
      (SELECT COUNT(*) FROM signers counted WHERE counted.envelope_id = e.id) AS recipient_count,
      ${DASHBOARD_STATUS_SQL} AS dashboard_status
    FROM envelopes e
    JOIN template_versions v ON v.id = e.template_version_id
    JOIN templates t ON t.id = v.template_id
    JOIN users u ON u.id = e.created_by
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${SORTS[sort]} ${direction}, e.id ${direction}
    LIMIT ? OFFSET ?`;
  return {
    sql,
    params: [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
    countSql: `SELECT COUNT(*) AS total
      FROM envelopes e
      JOIN template_versions v ON v.id = e.template_version_id
      JOIN templates t ON t.id = v.template_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`,
    countParams: params,
    page,
    pageSize: PAGE_SIZE,
    sort,
    direction: direction === 'ASC' ? 'asc' : 'desc',
  };
}

function isSort(value: string | undefined): value is DocumentSort {
  return !!value && value in SORTS;
}

function isUuid(value: string | undefined): value is string {
  return !!value && /^[a-f0-9-]{36}$/i.test(value);
}

function dateBound(value: string | undefined, exclusiveEnd: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 23).replace('T', ' ');
}
