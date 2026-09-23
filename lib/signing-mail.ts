import 'server-only';

import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { appendAuditEventInTransaction } from '@/lib/audit';
import { decryptValue } from '@/lib/encryption';
import { notificationKind, renderMail } from '@/lib/mail-templates';
import { safeErrorCode, sanitizeProviderResponse } from '@/lib/mail-security';
import { getMysqlPool } from '@/lib/mysql';
import { createSigningToken, fromMysqlUtc, hashSigningToken } from '@/lib/signing-domain';

type OutboxRow = RowDataPacket & {
  id: string;
  signer_id: string;
  envelope_id: string;
  notification_type: string;
  attempts: number;
  name_encrypted: string;
  email_encrypted: string;
  title: string;
  expires_at: string;
};

export function assertMailConfigured() {
  for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'APP_URL'])
    if (!process.env[name])
      throw new Error(`${name} is required before sending documents.`);
  const origin = new URL(process.env.APP_URL!);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost')
    throw new Error('APP_URL must use HTTPS for signing invitations.');
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (port !== 587 && port !== 465)
    throw new Error('SMTP_PORT must be 587 (STARTTLS) or 465 (TLS).');
  return origin.origin;
}

export async function resetFailedNotifications(envelopeId: string) {
  const [result] = await getMysqlPool().execute(
    `UPDATE notification_outbox o JOIN signers s ON s.id = o.signer_id
        SET o.status = 'pending', o.attempts = 0, o.claimed_at = NULL,
            o.next_attempt_at = NULL, o.last_error_code = NULL
      WHERE s.envelope_id = ? AND o.status = 'failed' AND o.attempts >= 3`,
    [envelopeId],
  );
  return (result as { affectedRows: number }).affectedRows;
}

export async function enqueueNotifications(
  connection: PoolConnection,
  signerIds: string[],
  type: string,
) {
  notificationKind(type);
  for (const signerId of signerIds)
    await connection.execute(
      `INSERT IGNORE INTO notification_outbox
       (id, signer_id, notification_type, status, created_at)
       VALUES (?, ?, ?, 'pending', UTC_TIMESTAMP(6))`,
      [randomUUID(), signerId, type],
    );
}

export async function enqueueInvitations(
  connection: PoolConnection,
  signerIds: string[],
  type: 'invite' | 'next_signer' = 'invite',
) {
  await enqueueNotifications(connection, signerIds, type);
}

export async function enqueueEnvelopeStatus(
  connection: PoolConnection,
  envelopeId: string,
  type: 'completion' | 'expiration' | 'decline' | 'void',
) {
  const [signers] = await connection.query<Array<RowDataPacket & { id: string }>>(
    'SELECT id FROM signers WHERE envelope_id = ? AND notified_at IS NOT NULL',
    [envelopeId],
  );
  await enqueueNotifications(connection, signers.map((signer) => signer.id), type);
}

export async function queueDueReminders(now = new Date()) {
  const [rows] = await getMysqlPool().query<
    Array<RowDataPacket & {
      signer_id: string;
      expires_at: string;
      notified_at: string | null;
      reminder_schedule_json: string | number[];
    }>
  >(
    `SELECT s.id AS signer_id, s.notified_at, e.expires_at, e.reminder_schedule_json
     FROM signers s JOIN envelopes e ON e.id = s.envelope_id
     WHERE e.status IN ('sent', 'viewed', 'partially_signed')
       AND e.expires_at > UTC_TIMESTAMP(6) AND s.status IN ('sent', 'viewed')`,
  );
  const connection = await getMysqlPool().getConnection();
  let queued = 0;
  try {
    await connection.beginTransaction();
    for (const row of rows) {
      if (!row.notified_at ||
          now.getTime() - fromMysqlUtc(row.notified_at).getTime() < 86_400_000)
        continue;
      const schedule = typeof row.reminder_schedule_json === 'string'
        ? JSON.parse(row.reminder_schedule_json) as number[]
        : row.reminder_schedule_json;
      if (!Array.isArray(schedule)) continue;
      const daysRemaining =
        (fromMysqlUtc(row.expires_at).getTime() - now.getTime()) / 86_400_000;
      const dueDay = schedule
        .filter((day) => Number.isInteger(day) && daysRemaining <= day)
        .sort((a, b) => a - b)[0];
      if (!dueDay) continue;
      const [result] = await connection.execute(
        `INSERT IGNORE INTO notification_outbox
         (id, signer_id, notification_type, status, created_at)
         VALUES (?, ?, ?, 'pending', UTC_TIMESTAMP(6))`,
        [randomUUID(), row.signer_id, `reminder_${dueDay}`],
      );
      queued += (result as { affectedRows: number }).affectedRows;
    }
    await connection.commit();
    return queued;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function dispatchNotifications(limit = 10) {
  const origin = assertMailConfigured();
  const transporter = createTransport();
  const results: Array<{ id: string; sent: boolean }> = [];
  try {
    for (let index = 0; index < limit; index++) {
      const row = await claimNotification();
      if (!row) break;
      const kind = notificationKind(row.notification_type);
      const token = kind === 'invite' || kind === 'next_signer'
        ? createSigningToken() : null;
      try {
        if (token)
          await getMysqlPool().execute(
            `UPDATE signers SET token_hash = ?, token_expires_at = ?
             WHERE id = ? AND status IN ('pending', 'sent')`,
            [hashSigningToken(token), row.expires_at, row.signer_id],
          );
        const content = renderMail({
          kind,
          name: decryptValue(row.name_encrypted, `signer:${row.signer_id}:name`),
          title: row.title,
          expiresAt: fromMysqlUtc(row.expires_at),
          signingUrl: token ? `${origin}/s/${token}` : undefined,
        });
        const response = await transporter.sendMail({
          from: process.env.SMTP_FROM,
          replyTo: process.env.SMTP_REPLY_TO || undefined,
          to: decryptValue(row.email_encrypted, `signer:${row.signer_id}:email`),
          ...content,
        });
        await recordDelivery(row, true, sanitizeProviderResponse(response.response), null);
        results.push({ id: row.id, sent: true });
      } catch (error) {
        await recordDelivery(row, false, null, safeErrorCode(error));
        results.push({ id: row.id, sent: false });
      }
    }
    return results;
  } finally {
    transporter.close();
  }
}

export async function verifyMailConnection() {
  assertMailConfigured();
  const transporter = createTransport();
  try {
    await transporter.verify();
    return true;
  } finally {
    transporter.close();
  }
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    logger: false,
    debug: false,
  });
}

export const dispatchInvitations = dispatchNotifications;

async function claimNotification(): Promise<OutboxRow | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<OutboxRow[]>(
      `SELECT o.id, o.signer_id, o.notification_type, o.attempts,
              s.envelope_id, s.name_encrypted, s.email_encrypted, e.title, e.expires_at
         FROM notification_outbox o
         JOIN signers s ON s.id = o.signer_id
         JOIN envelopes e ON e.id = s.envelope_id
        WHERE (o.status IN ('pending', 'failed') OR
               (o.status = 'sending' AND o.claimed_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE)))
          AND o.attempts < 3
          AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= UTC_TIMESTAMP(6))
          AND (
            (o.notification_type IN ('invite', 'next_signer')
              AND e.status IN ('sent', 'viewed', 'partially_signed')
              AND e.expires_at > UTC_TIMESTAMP(6) AND s.status IN ('pending', 'sent'))
            OR (o.notification_type LIKE 'reminder_%'
              AND e.status IN ('sent', 'viewed', 'partially_signed')
              AND e.expires_at > UTC_TIMESTAMP(6) AND s.status IN ('sent', 'viewed'))
            OR (o.notification_type = 'completion' AND e.status = 'completed')
            OR (o.notification_type = 'expiration' AND e.status = 'expired')
            OR (o.notification_type = 'decline' AND e.status = 'declined')
            OR (o.notification_type = 'void' AND e.status = 'voided')
          )
        ORDER BY o.created_at, o.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const row = rows[0];
    if (row)
      await connection.execute(
        `UPDATE notification_outbox SET status = 'sending', attempts = attempts + 1,
         claimed_at = UTC_TIMESTAMP(6), last_attempt_at = UTC_TIMESTAMP(6)
         WHERE id = ?`,
        [row.id],
      );
    await connection.commit();
    return row ?? null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function recordDelivery(
  row: OutboxRow,
  sent: boolean,
  providerResponse: string | null,
  errorCode: string | null,
) {
  const connection = await getMysqlPool().getConnection();
  const attempts = Number(row.attempts) + 1;
  try {
    await connection.beginTransaction();
    if (sent) {
      if (row.notification_type === 'invite' || row.notification_type === 'next_signer')
        await connection.execute(
          `UPDATE signers SET status = 'sent', notified_at = UTC_TIMESTAMP(6)
           WHERE id = ? AND status IN ('pending', 'sent')`,
          [row.signer_id],
        );
      await connection.execute(
        `UPDATE notification_outbox SET status = 'sent', sent_at = UTC_TIMESTAMP(6),
         provider_response = ?, last_error_code = NULL, next_attempt_at = NULL
         WHERE id = ?`,
        [providerResponse, row.id],
      );
    } else {
      const delaySeconds = attempts >= 3 ? null : 300 * 2 ** (attempts - 1);
      await connection.execute(
        `UPDATE notification_outbox SET status = 'failed', last_error_code = ?,
         next_attempt_at = IF(? IS NULL, NULL, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND))
         WHERE id = ?`,
        [errorCode, delaySeconds, delaySeconds, row.id],
      );
    }
    await appendAuditEventInTransaction(connection, {
      actorType: 'system',
      envelopeId: row.envelope_id,
      eventType: 'EMAIL_DELIVERY_ATTEMPT',
      details: {
        messageType: row.notification_type,
        recipientRef: row.signer_id,
        attempt: attempts,
        sentAt: sent ? new Date().toISOString() : null,
        providerResponse,
        errorCode,
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
