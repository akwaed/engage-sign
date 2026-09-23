import 'server-only';

import type { RowDataPacket } from 'mysql2/promise';

import { appendAuditEventInTransaction } from '@/lib/audit';
import { getMysqlPool } from '@/lib/mysql';
import { enqueueEnvelopeStatus } from '@/lib/signing-mail';

export async function expireDueEnvelopes(limit = 100) {
  const [due] = await getMysqlPool().query<
    Array<RowDataPacket & { id: string }>
  >(
    `SELECT id FROM envelopes WHERE status IN ('sent', 'viewed', 'partially_signed')
     AND expires_at <= UTC_TIMESTAMP(6) ORDER BY expires_at LIMIT ?`,
    [limit],
  );
  let expired = 0;
  for (const item of due) {
    const connection = await getMysqlPool().getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<
        Array<RowDataPacket & { id: string }>
      >(
        `SELECT id FROM envelopes WHERE id = ? AND status IN ('sent', 'viewed', 'partially_signed')
         AND expires_at <= UTC_TIMESTAMP(6) FOR UPDATE`,
        [item.id],
      );
      if (rows[0]) {
        await connection.execute(
          `UPDATE envelopes SET status = 'expired', updated_at = UTC_TIMESTAMP(6) WHERE id = ?`,
          [item.id],
        );
        await connection.execute(
          `UPDATE signers SET status = 'expired' WHERE envelope_id = ? AND status IN ('pending', 'sent', 'viewed')`,
          [item.id],
        );
        await connection.execute(
          `UPDATE signer_sessions SET revoked_at = UTC_TIMESTAMP(6)
           WHERE signer_id IN (SELECT id FROM signers WHERE envelope_id = ?) AND revoked_at IS NULL`,
          [item.id],
        );
        await enqueueEnvelopeStatus(connection, item.id, 'expiration');
        await appendAuditEventInTransaction(connection, {
          actorType: 'system',
          envelopeId: item.id,
          eventType: 'DOCUMENT_EXPIRED',
        });
        expired++;
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  return expired;
}
