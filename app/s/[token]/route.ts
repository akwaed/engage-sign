import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';

import { getMysqlPool } from '@/lib/mysql';
import {
  issueRecipientSession,
  recipientCookie,
} from '@/lib/recipient-session';
import { getPublicOrigin } from '@/lib/request-security';
import { hashSigningToken } from '@/lib/signing-domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Signer = RowDataPacket & { id: string; envelope_id: string };
type Document = RowDataPacket & {
  id: string;
  source_hash: string | null;
  document_hash: string;
  storage_key: string;
  byte_length: number;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const unavailable = () =>
    NextResponse.redirect(
      new URL('/sign/unavailable', getPublicOrigin(request)),
      303,
    );
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return unavailable();
  const connection = await getMysqlPool().getConnection();
  try {
    await connection.beginTransaction();
    const [signers] = await connection.query<Signer[]>(
      `SELECT s.id, s.envelope_id FROM signers s
       JOIN envelopes e ON e.id = s.envelope_id
       WHERE s.token_hash = ? AND s.token_used_at IS NULL
         AND s.token_expires_at > UTC_TIMESTAMP(6)
         AND s.status IN ('sent', 'viewed')
         AND e.expires_at > UTC_TIMESTAMP(6)
         AND e.status IN ('sent', 'viewed', 'partially_signed')
       LIMIT 1 FOR UPDATE`,
      [hashSigningToken(token)],
    );
    const signer = signers[0];
    if (!signer) {
      await connection.rollback();
      return unavailable();
    }
    const [documents] = await connection.query<Document[]>(
      `SELECT id, source_hash, document_hash, storage_key, byte_length
       FROM document_versions WHERE envelope_id = ?
         AND version_kind IN ('prepared', 'intermediate', 'final')
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [signer.envelope_id],
    );
    const document = documents[0];
    if (!document) throw new Error('Prepared document is unavailable.');
    const presentedId = randomUUID();
    await connection.execute(
      `INSERT INTO document_versions
       (id, envelope_id, version_kind, source_hash, document_hash, storage_key, byte_length, created_at)
       VALUES (?, ?, 'presented', ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [
        presentedId,
        signer.envelope_id,
        document.source_hash,
        document.document_hash,
        document.storage_key,
        document.byte_length,
      ],
    );
    const session = await issueRecipientSession(
      connection,
      signer.id,
      presentedId,
    );
    await connection.commit();
    const response = NextResponse.redirect(
      new URL(`/sign/${signer.envelope_id}`, getPublicOrigin(request)),
      303,
    );
    response.cookies.set(
      recipientCookie(
        session.token,
        session.expiresAt,
        new URL(getPublicOrigin(request)).protocol === 'https:',
      ),
    );
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    await connection.rollback().catch(() => undefined);
    return unavailable();
  } finally {
    connection.release();
  }
}
