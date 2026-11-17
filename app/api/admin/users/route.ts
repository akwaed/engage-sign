import { randomBytes, randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import {
  dispatchAccountNotifications,
  enqueueAccountMail,
} from '@/lib/auth/account-mail';
import { hashPassword } from '@/lib/auth/password';
import { assignableRole, canManageUsers, type Role } from '@/lib/auth/rbac';
import { getStaffUser, revokeUserSessions } from '@/lib/auth/session';
import { formText } from '@/lib/form-data';
import { redirectToLocalPath } from '@/lib/http-response';
import { getMysqlPool } from '@/lib/mysql';
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
  if (!actor || !canManageUsers(actor))
    return Response.json(
      { error: 'Administrator access is required.' },
      { status: 403 },
    );
  const form = await request.formData();
  const action = formText(form, 'action');
  const userAgent = request.headers.get('user-agent');
  const ipHash = hashClientIp(getClientIp(request));

  try {
    if (action === 'invite') {
      const email = formText(form, 'email').trim().toLowerCase().slice(0, 320);
      const displayName = formText(form, 'displayName').trim().slice(0, 160);
      const role = assignableRole(formText(form, 'role'));
      const canPublish =
        role === 'template_manager' && form.get('canPublish') === '1';
      if (!email.includes('@') || !displayName || !role)
        return redirectResult(request, 'error', 'invalid');
      const id = randomUUID();
      await getMysqlPool().execute<ResultSetHeader>(
        `INSERT INTO users
          (id, email, display_name, role, status, password_hash, failed_login_count,
           locked_until, password_changed_at, can_publish, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, 0, NULL, UTC_TIMESTAMP(6), ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
        [
          id,
          email,
          displayName,
          role,
          await hashPassword(randomBytes(32).toString('base64url')),
          canPublish ? 1 : 0,
        ],
      );
      await enqueueAccountMail(id, 'account_invite');
      await dispatchAccountNotifications(5).catch(() => []);
      await appendAuditEvent({
        actorType: 'user',
        actorId: actor.id,
        eventType: 'STAFF_USER_INVITED',
        details: { targetUserId: id, role, canPublish },
        ipHash,
        userAgent,
      });
      return redirectResult(request, 'message', 'invited');
    }

    const userId = formText(form, 'userId');
    if (!/^[a-f0-9-]{36}$/i.test(userId))
      return redirectResult(request, 'error', 'invalid');
    if (action === 'disable' || action === 'enable') {
      if (action === 'disable' && userId === actor.id)
        return redirectResult(request, 'error', 'self');
      if (action === 'disable' && (await isLastActiveAdmin(userId)))
        return redirectResult(request, 'error', 'last_admin');
      await getMysqlPool().execute<ResultSetHeader>(
        action === 'disable'
          ? "UPDATE users SET status = 'disabled', updated_at = UTC_TIMESTAMP(6) WHERE id = ?"
          : "UPDATE users SET status = 'active', failed_login_count = 0, locked_until = NULL, updated_at = UTC_TIMESTAMP(6) WHERE id = ?",
        [userId],
      );
      if (action === 'disable') await revokeUserSessions(userId);
      await appendAuditEvent({
        actorType: 'user',
        actorId: actor.id,
        eventType:
          action === 'disable' ? 'STAFF_USER_DISABLED' : 'STAFF_USER_ENABLED',
        details: { targetUserId: userId },
        ipHash,
        userAgent,
      });
      return redirectResult(
        request,
        'message',
        action === 'disable' ? 'disabled' : 'enabled',
      );
    }
    if (action === 'set_role') {
      const role = assignableRole(formText(form, 'role'));
      if (!role) return redirectResult(request, 'error', 'invalid');
      if (role !== 'admin' && (await isLastActiveAdmin(userId)))
        return redirectResult(request, 'error', 'last_admin');
      const canPublish =
        role === 'template_manager' && form.get('canPublish') === '1' ? 1 : 0;
      await getMysqlPool().execute<ResultSetHeader>(
        'UPDATE users SET role = ?, can_publish = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?',
        [role, canPublish, userId],
      );
      await revokeUserSessions(userId);
      await appendAuditEvent({
        actorType: 'user',
        actorId: actor.id,
        eventType: 'STAFF_ROLE_CHANGED',
        details: { targetUserId: userId, role, canPublish: canPublish === 1 },
        ipHash,
        userAgent,
      });
      return redirectResult(request, 'message', 'role');
    }
    if (action === 'send_reset') {
      const [rows] = await getMysqlPool().query<
        Array<RowDataPacket & { status: string }>
      >('SELECT status FROM users WHERE id = ? LIMIT 1', [userId]);
      if (rows[0]?.status !== 'active')
        return redirectResult(request, 'error', 'invalid');
      await enqueueAccountMail(userId, 'password_reset');
      await dispatchAccountNotifications(5).catch(() => []);
      await appendAuditEvent({
        actorType: 'user',
        actorId: actor.id,
        eventType: 'PASSWORD_RESET_REQUESTED',
        details: { targetUserId: userId, source: 'admin' },
        ipHash,
        userAgent,
      });
      return redirectResult(request, 'message', 'reset');
    }
    if (action === 'revoke_session' || action === 'revoke_sessions') {
      if (action === 'revoke_session') {
        const sessionId = formText(form, 'sessionId');
        if (!/^[a-f0-9-]{36}$/i.test(sessionId))
          return redirectResult(request, 'error', 'invalid');
        await getMysqlPool().execute<ResultSetHeader>(
          'UPDATE staff_sessions SET revoked_at = UTC_TIMESTAMP(6) WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
          [sessionId, userId],
        );
      } else {
        await revokeUserSessions(userId);
      }
      await appendAuditEvent({
        actorType: 'user',
        actorId: actor.id,
        eventType: 'STAFF_SESSIONS_REVOKED',
        details: { targetUserId: userId, scope: action },
        ipHash,
        userAgent,
      });
      return redirectResult(request, 'message', 'revoked');
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

async function isLastActiveAdmin(userId: string) {
  const [targetRows] = await getMysqlPool().query<
    Array<RowDataPacket & { role: Role }>
  >('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
  if (targetRows[0]?.role !== 'admin') return false;
  const [countRows] = await getMysqlPool().query<
    Array<RowDataPacket & { total: number }>
  >(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND status = 'active'",
  );
  return Number(countRows[0]?.total ?? 0) <= 1;
}

function redirectResult(
  request: Request,
  kind: 'message' | 'error',
  value: string,
) {
  const query = new URLSearchParams({ [kind]: value });
  return redirectToLocalPath(request, `/admin/users?${query.toString()}`);
}
