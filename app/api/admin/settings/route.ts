import type { ResultSetHeader } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import { canManageUsers } from '@/lib/auth/rbac';
import { getStaffUser } from '@/lib/auth/session';
import { formText } from '@/lib/form-data';
import { redirectToLocalPath } from '@/lib/http-response';
import { getMysqlPool } from '@/lib/mysql';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return redirectToLocalPath(request, '/admin/settings?error=request');
  }
  const actor = await getStaffUser();
  if (!actor || !canManageUsers(actor))
    return redirectToLocalPath(request, '/?error=forbidden');
  const days = formText(await request.formData(), 'retentionDays').trim();
  const retention = days === '' ? null : Number(days);
  if (
    retention !== null &&
    (!Number.isInteger(retention) || retention < 1 || retention > 36500)
  )
    return redirectToLocalPath(request, '/admin/settings?error=days');
  await getMysqlPool().execute<ResultSetHeader>(
    `INSERT INTO system_settings
      (id, default_expiration_days, reminder_schedule_json, retention_days,
       retention_purge_enabled, updated_by, updated_at)
     VALUES ('global', 14, JSON_ARRAY(7, 3, 1), ?, 0, ?, UTC_TIMESTAMP(6))
     ON DUPLICATE KEY UPDATE
       retention_days = VALUES(retention_days),
       retention_purge_enabled = 0,
       updated_by = VALUES(updated_by),
       updated_at = UTC_TIMESTAMP(6)`,
    [retention, actor.id],
  );
  await appendAuditEvent({
    actorType: 'user',
    actorId: actor.id,
    eventType: 'RETENTION_SETTINGS_UPDATED',
    details: { retentionDays: retention, purgeEnabled: false },
    ipHash: hashClientIp(getClientIp(request)),
    userAgent: request.headers.get('user-agent'),
  });
  return redirectToLocalPath(request, '/admin/settings?saved=1');
}
