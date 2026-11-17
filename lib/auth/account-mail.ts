import 'server-only';

import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEventInTransaction, toMysqlDate } from '@/lib/audit';
import { hashResetToken, resetExpiry } from '@/lib/auth/reset-token';
import { createResetToken } from '@/lib/auth/reset-token';
import { writeOutgoingMail } from '@/lib/mail-file';
import { renderAccountMail } from '@/lib/mail-templates';
import { safeErrorCode } from '@/lib/mail-security';
import { fileMailAppOrigin, resolveMailTransport } from '@/lib/mail-transport';
import { getMysqlPool } from '@/lib/mysql';
import { assertMailConfigured, sendConfiguredMail } from '@/lib/signing-mail';

type AccountMailType = 'password_reset' | 'account_invite';

type ClaimRow = RowDataPacket & {
  id: string;
  user_id: string;
  notification_type: AccountMailType;
  attempts: number;
  email: string;
};

export async function enqueueAccountMail(
  userId: string,
  type: AccountMailType,
) {
  await getMysqlPool().execute<ResultSetHeader>(
    `INSERT INTO notification_outbox
      (id, signer_id, user_id, notification_type, status, created_at)
     VALUES (?, NULL, ?, ?, 'pending', UTC_TIMESTAMP(6))`,
    [randomUUID(), userId, type],
  );
}

export async function dispatchAccountNotifications(limit = 10) {
  const transport = resolveMailTransport();
  if (transport.mode === 'smtp' && process.env.MAIL_ENABLED !== 'true')
    return [];
  const origin =
    transport.mode === 'file' ? fileMailAppOrigin() : assertMailConfigured();
  const results: Array<{ id: string; sent: boolean }> = [];
  for (let index = 0; index < limit; index += 1) {
    const row = await claimAccountNotification();
    if (!row) break;
    const token = createResetToken();
    const tokenHash = hashResetToken(token);
    const expiresAt = resetExpiry();
    try {
      await getMysqlPool().execute<ResultSetHeader>(
        `INSERT INTO password_reset_tokens
          (id, user_id, token_hash, expires_at, used_at, created_at)
         VALUES (?, ?, ?, ?, NULL, UTC_TIMESTAMP(6))`,
        [randomUUID(), row.user_id, tokenHash, toMysqlDate(expiresAt)],
      );
      const content = renderAccountMail({
        kind: row.notification_type,
        url: `${origin}/reset?token=${encodeURIComponent(token)}`,
        expiresAt,
      });
      const provider =
        transport.mode === 'file'
          ? await writeOutgoingMail(transport.directory, {
              to: row.email,
              from: process.env.SMTP_FROM,
              ...content,
            })
          : await sendConfiguredMail({ to: row.email, ...content });
      await getMysqlPool().execute<ResultSetHeader>(
        `UPDATE password_reset_tokens
            SET used_at = UTC_TIMESTAMP(6)
          WHERE user_id = ? AND token_hash <> ? AND used_at IS NULL`,
        [row.user_id, tokenHash],
      );
      await finishAccountDelivery(row, true, provider, null);
      results.push({ id: row.id, sent: true });
    } catch (error) {
      await getMysqlPool().execute(
        `UPDATE password_reset_tokens
            SET used_at = UTC_TIMESTAMP(6)
          WHERE token_hash = ? AND used_at IS NULL`,
        [tokenHash],
      );
      await finishAccountDelivery(row, false, null, safeErrorCode(error));
      results.push({ id: row.id, sent: false });
    }
  }
  return results;
}

async function claimAccountNotification(): Promise<ClaimRow | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<ClaimRow[]>(
      `SELECT o.id, o.user_id, o.notification_type, o.attempts, u.email
         FROM notification_outbox o
         JOIN users u ON u.id = o.user_id
        WHERE o.user_id IS NOT NULL
          AND o.notification_type IN ('password_reset', 'account_invite')
          AND u.status = 'active'
          AND (
            o.status IN ('pending', 'failed')
            OR (o.status = 'sending' AND o.claimed_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE))
          )
          AND o.attempts < 3
          AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= UTC_TIMESTAMP(6))
        ORDER BY o.created_at, o.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED`,
    );
    const row = rows[0];
    if (row) {
      await connection.execute(
        `UPDATE notification_outbox
            SET status = 'sending',
                attempts = attempts + 1,
                claimed_at = UTC_TIMESTAMP(6),
                last_attempt_at = UTC_TIMESTAMP(6)
          WHERE id = ?`,
        [row.id],
      );
    }
    await connection.commit();
    return row ?? null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function finishAccountDelivery(
  row: ClaimRow,
  sent: boolean,
  providerResponse: string | null,
  errorCode: string | null,
) {
  const connection = await getMysqlPool().getConnection();
  const attempts = Number(row.attempts) + 1;
  try {
    await connection.beginTransaction();
    if (sent) {
      await connection.execute(
        `UPDATE notification_outbox
            SET status = 'sent', sent_at = UTC_TIMESTAMP(6),
                provider_response = ?, last_error_code = NULL, next_attempt_at = NULL
          WHERE id = ?`,
        [providerResponse, row.id],
      );
    } else {
      const delaySeconds = attempts >= 3 ? null : 300 * 2 ** (attempts - 1);
      await connection.execute(
        `UPDATE notification_outbox
            SET status = 'failed', last_error_code = ?,
                next_attempt_at = IF(? IS NULL, NULL, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND))
          WHERE id = ?`,
        [errorCode, delaySeconds, delaySeconds, row.id],
      );
    }
    await appendAuditEventInTransaction(connection, {
      actorType: 'system',
      actorId: row.user_id,
      eventType: 'ACCOUNT_EMAIL_DELIVERY',
      details: {
        messageType: row.notification_type,
        attempt: attempts,
        status: sent ? 'sent' : attempts >= 3 ? 'failed' : 'retry_scheduled',
      },
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
