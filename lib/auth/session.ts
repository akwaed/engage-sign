import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { toMysqlDate } from '@/lib/audit';
import { getMysqlPool } from '@/lib/mysql';

export const SESSION_COOKIE = 'engage_sign_session';
const SESSION_HOURS = 12;

export type StaffUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'staff';
};

export async function createStaffSession(input: {
  user: StaffUser;
  userAgent: string | null;
  ipHash: string | null;
}) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await getMysqlPool().execute<ResultSetHeader>(
    `INSERT INTO staff_sessions
      (id, user_id, token_hash, ip_hash, user_agent, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), ?)`,
    [
      randomUUID(),
      input.user.id,
      tokenHash(token),
      input.ipHash,
      input.userAgent,
      toMysqlDate(expiresAt),
    ],
  );
  return { token, expiresAt };
}

export async function getStaffUser(): Promise<StaffUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [rows] = await getMysqlPool().query<
    Array<
      RowDataPacket & {
        session_id: string;
        id: string;
        email: string;
        display_name: string;
        role: 'admin' | 'staff';
      }
    >
  >(
    `SELECT s.id AS session_id, u.id, u.email, u.display_name, u.role
       FROM staff_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > UTC_TIMESTAMP(6)
        AND u.status = 'active'
      LIMIT 1`,
    [tokenHash(token)],
  );
  const row = rows[0];
  if (!row) return null;

  void getMysqlPool()
    .execute(
      'UPDATE staff_sessions SET last_seen_at = UTC_TIMESTAMP(6) WHERE id = ?',
      [row.session_id],
    )
    .catch(() => undefined);
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}

export async function requireStaffUser(returnTo = '/'): Promise<StaffUser> {
  let user: StaffUser | null = null;
  try {
    user = await getStaffUser();
  } catch {
    redirect('/setup?error=database');
  }
  if (!user)
    redirect(`/login?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`);
  return user;
}

export async function requireAdmin(returnTo = '/admin/users') {
  const user = await requireStaffUser(returnTo);
  if (user.role !== 'admin') redirect('/?error=forbidden');
  return user;
}

export async function revokeCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;
  await getMysqlPool().execute<ResultSetHeader>(
    'UPDATE staff_sessions SET revoked_at = UTC_TIMESTAMP(6) WHERE token_hash = ? AND revoked_at IS NULL',
    [tokenHash(token)],
  );
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

export function expiredSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: new Date(0),
  };
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
