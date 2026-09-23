import 'server-only';

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

import { toMysqlDate } from '@/lib/audit';
import { getMysqlPool } from '@/lib/mysql';
import { createSigningToken, hashSigningToken } from '@/lib/signing-domain';

export const RECIPIENT_COOKIE = 'engage_sign_recipient';
const SESSION_MINUTES = 30;

export type RecipientSession = RowDataPacket & {
  session_id: string;
  signer_id: string;
  envelope_id: string;
  signer_role: string;
  signer_status: string;
  envelope_status: string;
  presented_document_id: string;
  presented_document_hash: string;
  title: string;
  name_encrypted: string;
  expires_at: string;
};

export async function issueRecipientSession(
  connection: PoolConnection,
  signerId: string,
  presentedDocumentId: string,
) {
  const token = createSigningToken();
  const expiresAt = new Date(Date.now() + SESSION_MINUTES * 60_000);
  await connection.execute(
    `INSERT INTO signer_sessions
     (id, signer_id, token_hash, presented_document_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6), ?)`,
    [
      randomUUID(),
      signerId,
      hashSigningToken(token),
      presentedDocumentId,
      toMysqlDate(expiresAt),
    ],
  );
  return { token, expiresAt };
}

export async function getRecipientSession(
  includeSigned = false,
): Promise<RecipientSession | null> {
  const token = (await cookies()).get(RECIPIENT_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [rows] = await getMysqlPool().query<RecipientSession[]>(
    `SELECT ss.id AS session_id, s.id AS signer_id, s.envelope_id, s.signer_role,
            s.status AS signer_status, e.status AS envelope_status,
            ss.presented_document_id, d.document_hash AS presented_document_hash,
            e.title, s.name_encrypted, e.expires_at
       FROM signer_sessions ss
       JOIN signers s ON s.id = ss.signer_id
       JOIN envelopes e ON e.id = s.envelope_id
       JOIN document_versions d ON d.id = ss.presented_document_id
      WHERE ss.token_hash = ? AND ss.revoked_at IS NULL
        AND ss.expires_at > UTC_TIMESTAMP(6)
        ${includeSigned ? '' : "AND s.token_used_at IS NULL AND s.status IN ('sent', 'viewed')"}
        ${includeSigned ? '' : 'AND e.expires_at > UTC_TIMESTAMP(6)'}
        AND e.status IN ('sent', 'viewed', 'partially_signed'${includeSigned ? ", 'completed'" : ''})
      LIMIT 1`,
    [hashSigningToken(token)],
  );
  return rows[0] ?? null;
}

export function recipientCookie(
  token: string,
  expiresAt: Date,
  secure = process.env.NODE_ENV === 'production',
) {
  return {
    name: RECIPIENT_COOKIE,
    value: token,
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
    expires: expiresAt,
  };
}

export function expiredRecipientCookie() {
  return { ...recipientCookie('', new Date(0)) };
}
