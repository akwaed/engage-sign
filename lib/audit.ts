import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';

import { getMysqlPool } from '@/lib/mysql';

export type AuditInput = {
  actorType: 'system' | 'user' | 'signer';
  actorId?: string | null;
  envelopeId?: string | null;
  eventType: string;
  details?: Record<string, unknown>;
  ipHash?: string | null;
  userAgent?: string | null;
};

export async function appendAuditEvent(input: AuditInput) {
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await appendAuditEventInTransaction(connection, input);
    await connection.commit();
    return result;
  } catch (error) {
    await safelyRollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

export async function appendAuditEventInTransaction(
  connection: PoolConnection,
  input: AuditInput,
) {
  const [rows] = await connection.query<
    Array<RowDataPacket & { event_hash: string }>
  >(
    'SELECT event_hash FROM audit_events ORDER BY occurred_at DESC, id DESC LIMIT 1 FOR UPDATE',
  );
  const previousHash = rows[0]?.event_hash ?? null;
  const id = randomUUID();
  const occurredAt = new Date().toISOString();
  const detailsJson = JSON.stringify({
    ...input.details,
    ...(input.ipHash ? { ipHash: input.ipHash } : {}),
  });
  const eventHash = createHash('sha256')
    .update(
      JSON.stringify({
        id,
        envelopeId: input.envelopeId ?? null,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        eventType: input.eventType,
        detailsJson,
        userAgent: input.userAgent ?? null,
        occurredAt,
        previousHash,
      }),
    )
    .digest('hex');

  await connection.execute<ResultSetHeader>(
    `INSERT INTO audit_events
        (id, envelope_id, actor_type, actor_id, event_type, details_json,
         ip_address_encrypted, user_agent, occurred_at, previous_hash, event_hash)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      id,
      input.envelopeId ?? null,
      input.actorType,
      input.actorId ?? null,
      input.eventType,
      detailsJson,
      input.userAgent ?? null,
      toMysqlDate(occurredAt),
      previousHash,
      eventHash,
    ],
  );
  return { id, occurredAt, eventHash, previousHash };
}

export function toMysqlDate(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value))
    .toISOString()
    .slice(0, 23)
    .replace('T', ' ');
}

async function safelyRollback(connection: PoolConnection) {
  try {
    await connection.rollback();
  } catch {
    // The original database error is the useful one.
  }
}
