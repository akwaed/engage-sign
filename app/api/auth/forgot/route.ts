import type { RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import {
  dispatchAccountNotifications,
  enqueueAccountMail,
} from '@/lib/auth/account-mail';
import { RATE_LIMITS } from '@/lib/auth/rate-limit-policy';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { formText } from '@/lib/form-data';
import { redirectToLocalPath } from '@/lib/http-response';
import { getMysqlPool } from '@/lib/mysql';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return redirectToLocalPath(request, '/forgot?error=request');
  }
  const form = await request.formData();
  const email = formText(form, 'email').trim().toLowerCase().slice(0, 320);
  const ip = getClientIp(request) ?? 'unknown';
  const ipAllowed = await consumeRateLimit({
    ...RATE_LIMITS.forgotIp,
    value: ip,
  });
  const emailAllowed = email
    ? await consumeRateLimit({ ...RATE_LIMITS.forgotEmail, value: email })
    : false;
  if (ipAllowed && emailAllowed && email.includes('@')) {
    const [rows] = await getMysqlPool().query<
      Array<RowDataPacket & { id: string }>
    >("SELECT id FROM users WHERE email = ? AND status = 'active' LIMIT 1", [
      email,
    ]);
    const user = rows[0];
    if (user) {
      await enqueueAccountMail(user.id, 'password_reset');
      await dispatchAccountNotifications(5).catch(() => []);
      await appendAuditEvent({
        actorType: 'user',
        actorId: user.id,
        eventType: 'PASSWORD_RESET_REQUESTED',
        details: { source: 'self_service' },
        ipHash: hashClientIp(ip === 'unknown' ? null : ip),
        userAgent: request.headers.get('user-agent'),
      });
    }
  }
  return redirectToLocalPath(request, '/forgot?sent=1');
}
