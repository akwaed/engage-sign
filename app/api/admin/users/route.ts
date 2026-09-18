import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import { hashPassword, validatePassword } from '@/lib/auth/password';
import { getStaffUser } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';
import { formText } from '@/lib/form-data';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return redirectResult(request, 'error', 'request');
  }
  const actor = await getStaffUser();
  if (!actor || actor.role !== 'admin')
    return Response.json(
      { error: 'Administrator access is required.' },
      { status: 403 },
    );
  const form = await request.formData();
  const action = formText(form, 'action');
  const userAgent = request.headers.get('user-agent');
  const ipHash = hashClientIp(getClientIp(request));

  try {
    if (action === 'create') {
      const email = formText(form, 'email').trim().toLowerCase().slice(0, 320);
      const displayName = formText(form, 'displayName').trim().slice(0, 160);
      const role = form.get('role') === 'admin' ? 'admin' : 'staff';
      const password = formText(form, 'password');
      if (!email.includes('@') || !displayName)
        return redirectResult(request, 'error', 'invalid');
      if (validatePassword(password))
        return redirectResult(request, 'error', 'password');
      const id = randomUUID();
      await getMysqlPool().execute<ResultSetHeader>(
        `INSERT INTO users (id, email, display_name, role, status, password_hash, failed_login_count, locked_until, password_changed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, 0, NULL, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
        [id, email, displayName, role, await hashPassword(password)],
      );
      await appendAuditEvent({
        actorType: 'user',
        actorId: actor.id,
        eventType: 'STAFF_USER_CREATED',
        details: { targetUserId: id, role },
        ipHash,
        userAgent,
      });
      return redirectResult(request, 'message', 'created');
    }

    const userId = formText(form, 'userId');
    if (!userId) return redirectResult(request, 'error', 'invalid');
    if (action === 'disable') {
      if (userId === actor.id) return redirectResult(request, 'error', 'self');
      const [targetRows] = await getMysqlPool().query<
        Array<RowDataPacket & { role: 'admin' | 'staff' }>
      >('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
      if (targetRows[0]?.role === 'admin') {
        const [countRows] = await getMysqlPool().query<
          Array<RowDataPacket & { total: number }>
        >(
          "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND status = 'active'",
        );
        if (Number(countRows[0]?.total ?? 0) <= 1)
          return redirectResult(request, 'error', 'last_admin');
      }
      await getMysqlPool().execute<ResultSetHeader>(
        "UPDATE users SET status = 'disabled', updated_at = UTC_TIMESTAMP(6) WHERE id = ?",
        [userId],
      );
      await getMysqlPool().execute<ResultSetHeader>(
        'UPDATE staff_sessions SET revoked_at = UTC_TIMESTAMP(6) WHERE user_id = ? AND revoked_at IS NULL',
        [userId],
      );
      await appendAuditEvent({
        actorType: 'user',
        actorId: actor.id,
        eventType: 'STAFF_USER_DISABLED',
        details: { targetUserId: userId },
        ipHash,
        userAgent,
      });
      return redirectResult(request, 'message', 'disabled');
    }
    if (action === 'enable') {
      await getMysqlPool().execute<ResultSetHeader>(
        "UPDATE users SET status = 'active', failed_login_count = 0, locked_until = NULL, updated_at = UTC_TIMESTAMP(6) WHERE id = ?",
        [userId],
      );
      await appendAuditEvent({
        actorType: 'user',
        actorId: actor.id,
        eventType: 'STAFF_USER_ENABLED',
        details: { targetUserId: userId },
        ipHash,
        userAgent,
      });
      return redirectResult(request, 'message', 'enabled');
    }
    if (action === 'reset_password') {
      const password = formText(form, 'password');
      if (validatePassword(password))
        return redirectResult(request, 'error', 'password');
      await getMysqlPool().execute<ResultSetHeader>(
        'UPDATE users SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(6), failed_login_count = 0, locked_until = NULL, updated_at = UTC_TIMESTAMP(6) WHERE id = ?',
        [await hashPassword(password), userId],
      );
      await getMysqlPool().execute<ResultSetHeader>(
        'UPDATE staff_sessions SET revoked_at = UTC_TIMESTAMP(6) WHERE user_id = ? AND revoked_at IS NULL',
        [userId],
      );
      await appendAuditEvent({
        actorType: 'user',
        actorId: actor.id,
        eventType: 'STAFF_PASSWORD_RESET_BY_ADMIN',
        details: { targetUserId: userId },
        ipHash,
        userAgent,
      });
      return redirectResult(request, 'message', 'password');
    }
    return redirectResult(request, 'error', 'invalid');
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error &&
      'code' in error &&
      error.code === 'ER_DUP_ENTRY'
        ? 'duplicate'
        : 'save';
    return redirectResult(request, 'error', code);
  }
}

function redirectResult(
  request: Request,
  kind: 'message' | 'error',
  value: string,
) {
  const url = new URL('/admin/users', request.url);
  url.searchParams.set(kind, value);
  return NextResponse.redirect(url, 303);
}
