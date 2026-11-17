import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { RATE_LIMITS } from '@/lib/auth/rate-limit-policy';
import { setupAllowed } from '@/lib/auth/setup-policy';
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
    return redirectError(request, 'request');
  }
  const ip = getClientIp(request) ?? 'unknown';
  if (!(await consumeRateLimit({ ...RATE_LIMITS.setupIp, value: ip })))
    return redirectError(request, 'limited');
  const form = await request.formData();
  const displayName = formText(form, 'displayName').trim().slice(0, 160);
  const email = formText(form, 'email').trim().toLowerCase().slice(0, 320);
  const password = formText(form, 'password');
  const suppliedToken = formText(form, 'setupToken');
  if (!displayName || !email.includes('@'))
    return redirectError(request, 'invalid');
  if (validatePassword(password)) return redirectError(request, 'password');

  const pool = getMysqlPool();
  const connection = await pool.getConnection();
  let userId = '';
  try {
    const [lockRows] = await connection.query<
      Array<RowDataPacket & { acquired: number }>
    >("SELECT GET_LOCK('engage-sign-first-admin', 10) AS acquired");
    if (Number(lockRows[0]?.acquired) !== 1)
      throw new Error('Setup is already in progress.');
    const [existing] = await connection.query<
      Array<RowDataPacket & { total: number }>
    >('SELECT COUNT(*) AS total FROM users');
    const [settings] = await connection.query<
      Array<RowDataPacket & { setup_completed: number }>
    >('SELECT setup_completed FROM system_settings WHERE id = ? LIMIT 1', [
      'global',
    ]);
    const decision = setupAllowed({
      setupCompleted: Number(settings[0]?.setup_completed ?? 0) === 1,
      userCount: Number(existing[0]?.total ?? 0),
      suppliedToken,
      expectedToken: process.env.SETUP_TOKEN ?? '',
    });
    if (decision !== 'ok') return redirectError(request, decision);
    userId = randomUUID();
    const passwordHash = await hashPassword(password);
    await connection.beginTransaction();
    await connection.execute<ResultSetHeader>(
      `INSERT INTO users
        (id, email, display_name, role, status, password_hash, failed_login_count,
         locked_until, password_changed_at, can_publish, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, 0, NULL, UTC_TIMESTAMP(6), 0, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
      [userId, email, displayName, passwordHash],
    );
    await connection.execute<ResultSetHeader>(
      'UPDATE system_settings SET setup_completed = 1, updated_at = UTC_TIMESTAMP(6) WHERE id = ?',
      ['global'],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    try {
      await connection.query("SELECT RELEASE_LOCK('engage-sign-first-admin')");
    } catch {}
    connection.release();
  }

  await appendAuditEvent({
    actorType: 'user',
    actorId: userId,
    eventType: 'FIRST_ADMIN_CREATED',
    details: {},
    ipHash: hashClientIp(getClientIp(request)),
    userAgent: request.headers.get('user-agent'),
  });
  return redirectToLocalPath(request, '/login?setup=complete');
}

function redirectError(request: Request, error: string) {
  return redirectToLocalPath(
    request,
    `/setup?error=${encodeURIComponent(error)}`,
  );
}
