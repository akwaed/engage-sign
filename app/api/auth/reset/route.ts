import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { RATE_LIMITS } from '@/lib/auth/rate-limit-policy';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { hashResetToken } from '@/lib/auth/reset-token';
import { revokeUserSessions } from '@/lib/auth/session';
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
    return redirectToLocalPath(request, '/reset?error=request');
  }
  const form = await request.formData();
  const token = formText(form, 'token');
  const password = formText(form, 'password');
  const ip = getClientIp(request) ?? 'unknown';
  const ipAllowed = await consumeRateLimit({
    ...RATE_LIMITS.resetIp,
    value: ip,
  });
  const tokenAllowed = await consumeRateLimit({
    ...RATE_LIMITS.resetToken,
    value: token || 'missing',
  });
  if (!ipAllowed || !tokenAllowed || validatePassword(password))
    return redirectToLocalPath(request, '/reset?error=invalid');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    return redirectToLocalPath(request, '/reset?error=invalid');

  const connection = await getMysqlPool().getConnection();
  let userId = '';
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<
      Array<RowDataPacket & { id: string; user_id: string }>
    >(
      `SELECT t.id, t.user_id
         FROM password_reset_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?
          AND t.used_at IS NULL
          AND t.expires_at > UTC_TIMESTAMP(6)
          AND u.status = 'active'
        LIMIT 1
        FOR UPDATE`,
      [hashResetToken(token)],
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      return redirectToLocalPath(request, '/reset?error=invalid');
    }
    userId = row.user_id;
    await connection.execute<ResultSetHeader>(
      `UPDATE users
          SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(6),
              failed_login_count = 0, locked_until = NULL, updated_at = UTC_TIMESTAMP(6)
        WHERE id = ?`,
      [await hashPassword(password), userId],
    );
    await connection.execute<ResultSetHeader>(
      'UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP(6) WHERE user_id = ? AND used_at IS NULL',
      [userId],
    );
    await connection.execute<ResultSetHeader>(
      'UPDATE staff_sessions SET revoked_at = UTC_TIMESTAMP(6) WHERE user_id = ? AND revoked_at IS NULL',
      [userId],
    );
    await connection.commit();
  } catch {
    await connection.rollback();
    return redirectToLocalPath(request, '/reset?error=invalid');
  } finally {
    connection.release();
  }
  await revokeUserSessions(userId);
  await appendAuditEvent({
    actorType: 'user',
    actorId: userId,
    eventType: 'PASSWORD_RESET_COMPLETED',
    details: {},
    ipHash: hashClientIp(ip === 'unknown' ? null : ip),
    userAgent: request.headers.get('user-agent'),
  });
  return redirectToLocalPath(request, '/login?reset=complete');
}
