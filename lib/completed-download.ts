import 'server-only';

import type { RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import type { AccessUser } from '@/lib/auth/rbac';
import { completedDownloadAllowed as statusAllowsDownload } from '@/lib/document-status';
import { getMysqlPool } from '@/lib/mysql';
import { readPrivateObject } from '@/lib/private-storage';
import { hashClientIp } from '@/lib/request-security';
import { sha256 } from '@/lib/template-files';

export type CompletedFileKind = 'final_pdf' | 'audit_certificate';

const versionKind: Record<CompletedFileKind, 'final' | 'audit_certificate'> = {
  final_pdf: 'final',
  audit_certificate: 'audit_certificate',
};

export function completedDownloadAllowed(
  user: AccessUser,
  createdBy: string,
  status: string,
) {
  return statusAllowsDownload({
    isAdmin: user.role === 'admin',
    sameOwner: user.id === createdBy,
    status,
  });
}

export async function readCompletedDownload(input: {
  user: AccessUser;
  envelopeId: string;
  kind: CompletedFileKind;
  ipHash: string | null;
  userAgent: string | null;
}) {
  const [owners] = await getMysqlPool().query<
    Array<RowDataPacket & { created_by: string; status: string }>
  >('SELECT created_by, status FROM envelopes WHERE id = ? LIMIT 1', [
    input.envelopeId,
  ]);
  const owner = owners[0];
  if (
    !owner ||
    !completedDownloadAllowed(input.user, owner.created_by, owner.status)
  )
    return null;
  const [files] = await getMysqlPool().query<
    Array<RowDataPacket & { document_hash: string; storage_key: string }>
  >(
    `SELECT document_hash, storage_key FROM document_versions
      WHERE envelope_id = ? AND version_kind = ?
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [input.envelopeId, versionKind[input.kind]],
  );
  const file = files[0];
  if (!file) return null;
  const bytes = await readPrivateObject(file.storage_key);
  if (sha256(bytes) !== file.document_hash)
    throw new Error('Stored file failed SHA-256 verification.');
  await appendAuditEvent({
    actorType: 'user',
    actorId: input.user.id,
    envelopeId: input.envelopeId,
    eventType: 'DOCUMENT_DOWNLOADED',
    details: { kind: input.kind, sha256: file.document_hash },
    ipHash: input.ipHash,
    userAgent: input.userAgent,
  });
  return { bytes, hash: file.document_hash };
}

export function downloadIpHash(ip: string | null) {
  return hashClientIp(ip);
}
