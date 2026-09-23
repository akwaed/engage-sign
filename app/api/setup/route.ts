import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import { hashPassword, validatePassword } from '@/lib/auth/password';
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
    return redirectError('request');
  }
  const form = await request.formData();
  const displayName = formText(form, 'displayName').trim().slice(0, 160);
  const email = formText(form, 'email').trim().toLowerCase().slice(0, 320);
  const password = formText(form, 'password');
  const suppliedToken = formText(form, 'setupToken');
  const expectedToken = process.env.SETUP_TOKEN ?? '';
  if (!displayName || !email.includes('@')) return redirectError('invalid');
  if (validatePassword(password)) return redirectError('password');
  if (!expectedToken || !safeEqual(suppliedToken, expectedToken))
    return redirectError('token');

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
    if (Number(existing[0]?.total ?? 0) > 0) return redirectError('exists');
    userId = randomUUID();
    const passwordHash = await hashPassword(password);
    await connection.execute<ResultSetHeader>(
      `INSERT INTO users
        (id, email, display_name, role, status, password_hash, failed_login_count,
         locked_until, password_changed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, 0, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
      [userId, email, displayName, passwordHash],
    );
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
    details: { email },
    ipHash: hashClientIp(getClientIp(request)),
    userAgent: request.headers.get('user-agent'),
  });
  return redirectToLocalPath('/login?setup=complete');
}

function safeEqual(left: string, right: string) {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
function redirectError(error: string) {
  return redirectToLocalPath(`/setup?error=${encodeURIComponent(error)}`);
}
