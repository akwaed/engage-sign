import { NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  createStaffSession,
  safeReturnTo,
  sessionCookie,
  type StaffUser,
} from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';
import { formText } from '@/lib/form-data';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';

type UserRow = RowDataPacket &
  StaffUser & {
    display_name: string;
    password_hash: string;
    status: 'active' | 'disabled';
    failed_login_count: number;
    locked_until: string | null;
  };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return errorRedirect(request, 'request', '/');
  }
  const form = await request.formData();
  const email = formText(form, 'email').trim().toLowerCase().slice(0, 320);
  const password = formText(form, 'password');
  const returnTo = safeReturnTo(formText(form, 'returnTo'));
  const [rows] = await getMysqlPool().query<UserRow[]>(
    `SELECT id, email, display_name, role, password_hash, status, failed_login_count, locked_until
       FROM users WHERE email = ? LIMIT 1`,
    [email],
  );
  const row = rows[0];
  const now = Date.now();
  if (row?.status === 'disabled')
    return errorRedirect(request, 'disabled', returnTo);
  if (
    row?.locked_until &&
    new Date(`${row.locked_until.replace(' ', 'T')}Z`).getTime() > now
  )
    return errorRedirect(request, 'locked', returnTo);

  const valid = row
    ? await verifyPassword(password, row.password_hash)
    : await hashPassword(password).then(() => false);
  if (!row || !valid) {
    if (row) {
      const failures = Number(row.failed_login_count) + 1;
      await getMysqlPool().execute<ResultSetHeader>(
        `UPDATE users SET failed_login_count = ?, locked_until = IF(? >= 5, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 15 MINUTE), NULL), updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
        [failures >= 5 ? 0 : failures, failures, row.id],
      );
    }
    return errorRedirect(
      request,
      row && Number(row.failed_login_count) + 1 >= 5 ? 'locked' : 'invalid',
      returnTo,
    );
  }

  const user: StaffUser = {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
  await getMysqlPool().execute<ResultSetHeader>(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = UTC_TIMESTAMP(6) WHERE id = ?',
    [user.id],
  );
  const ipHash = hashClientIp(getClientIp(request));
  const session = await createStaffSession({
    user,
    ipHash,
    userAgent: request.headers.get('user-agent'),
  });
  await appendAuditEvent({
    actorType: 'user',
    actorId: user.id,
    eventType: 'STAFF_LOGIN_SUCCEEDED',
    details: { role: user.role },
    ipHash,
    userAgent: request.headers.get('user-agent'),
  });
  const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.cookies.set(sessionCookie(session.token, session.expiresAt));
  return response;
}

function errorRedirect(request: Request, error: string, returnTo: string) {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', error);
  url.searchParams.set('return_to', safeReturnTo(returnTo));
  return NextResponse.redirect(url, 303);
}
