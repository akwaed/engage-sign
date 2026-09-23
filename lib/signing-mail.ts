import 'server-only';

import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { decryptValue } from '@/lib/encryption';
import { getMysqlPool } from '@/lib/mysql';
import {
  createSigningToken,
  fromMysqlUtc,
  hashSigningToken,
} from '@/lib/signing-domain';

type OutboxRow = RowDataPacket & {
  id: string;
  signer_id: string;
  envelope_id: string;
  name_encrypted: string;
  email_encrypted: string;
  title: string;
  expires_at: string;
};

export function assertMailConfigured() {
  for (const name of [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'APP_URL',
  ])
    if (!process.env[name])
      throw new Error(`${name} is required before sending documents.`);
  const origin = new URL(process.env.APP_URL!);
  if (origin.protocol !== 'https:' && origin.hostname !== 'localhost')
    throw new Error('APP_URL must use HTTPS for signing invitations.');
  return origin.origin;
}

export async function resetFailedInvitations(envelopeId: string) {
  const [result] = await getMysqlPool().execute(
    `UPDATE notification_outbox o JOIN signers s ON s.id = o.signer_id
        SET o.status = 'pending', o.attempts = 0, o.claimed_at = NULL
      WHERE s.envelope_id = ? AND o.notification_type = 'invite'
        AND o.status = 'failed' AND o.attempts >= 3
        AND s.status IN ('pending', 'sent')`,
    [envelopeId],
  );
  return (result as { affectedRows: number }).affectedRows;
}

export async function enqueueInvitations(
  connection: PoolConnection,
  signerIds: string[],
) {
  for (const signerId of signerIds) {
    await connection.execute(
      `INSERT IGNORE INTO notification_outbox
       (id, signer_id, notification_type, status, created_at)
       VALUES (?, ?, 'invite', 'pending', UTC_TIMESTAMP(6))`,
      [randomUUID(), signerId],
    );
  }
}

export async function dispatchInvitations(limit = 10) {
  const origin = assertMailConfigured();
  const results: Array<{ id: string; sent: boolean }> = [];
  for (let index = 0; index < limit; index++) {
    const row = await claimInvitation();
    if (!row) break;
    const token = createSigningToken();
    const expires = fromMysqlUtc(row.expires_at);
    const link = `${origin}/s/${token}`;
    try {
      await getMysqlPool().execute(
        `UPDATE signers SET token_hash = ?, token_expires_at = ?
         WHERE id = ? AND status IN ('pending', 'sent')`,
        [hashSigningToken(token), row.expires_at, row.signer_id],
      );
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        requireTLS: true,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        tls: { rejectUnauthorized: true },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        logger: false,
        debug: false,
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        replyTo: process.env.SMTP_REPLY_TO || undefined,
        to: decryptValue(row.email_encrypted, `signer:${row.signer_id}:email`),
        subject: `Please sign: ${row.title}`,
        text: `Hello ${decryptValue(row.name_encrypted, `signer:${row.signer_id}:name`)},\n\nPlease review and sign “${row.title}” by ${expires.toUTCString()}.\n\n${link}\n\nThis private link is intended only for you.`,
      });
      await getMysqlPool().execute(
        `UPDATE signers SET status = 'sent', notified_at = UTC_TIMESTAMP(6)
         WHERE id = ? AND status IN ('pending', 'sent')`,
        [row.signer_id],
      );
      await getMysqlPool().execute(
        `UPDATE notification_outbox SET status = 'sent', sent_at = UTC_TIMESTAMP(6) WHERE id = ?`,
        [row.id],
      );
      results.push({ id: row.id, sent: true });
    } catch {
      await getMysqlPool().execute(
        `UPDATE notification_outbox SET status = 'failed' WHERE id = ?`,
        [row.id],
      );
      results.push({ id: row.id, sent: false });
    }
  }
  return results;
}

async function claimInvitation(): Promise<OutboxRow | null> {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<OutboxRow[]>(
      `SELECT o.id, o.signer_id, s.envelope_id, s.name_encrypted, s.email_encrypted,
              e.title, e.expires_at
         FROM notification_outbox o
         JOIN signers s ON s.id = o.signer_id
         JOIN envelopes e ON e.id = s.envelope_id
        WHERE o.notification_type = 'invite'
          AND (o.status IN ('pending', 'failed') OR
            (o.status = 'sending' AND o.claimed_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE)))
          AND o.attempts < 3 AND e.status NOT IN ('draft', 'completed', 'declined', 'expired', 'voided')
          AND e.expires_at > UTC_TIMESTAMP(6) AND s.status IN ('pending', 'sent')
        ORDER BY o.created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const row = rows[0];
    if (row)
      await connection.execute(
        `UPDATE notification_outbox SET status = 'sending', attempts = attempts + 1,
       claimed_at = UTC_TIMESTAMP(6) WHERE id = ?`,
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
