import 'server-only';

import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';

import { decryptValue } from '@/lib/encryption';
import { buildFinalArchive, verifyFinalArchive, type ArchiveVersion } from '@/lib/final-archive';
import { getMysqlPool } from '@/lib/mysql';
import { readPrivateObject, removePrivateObject, storePrivateObject } from '@/lib/private-storage';
import { fromMysqlUtc } from '@/lib/signing-domain';
import { sha256 } from '@/lib/template-files';

type ArchiveRow = RowDataPacket & {
  archive_hash: string;
  certificate_hash: string;
  final_document_hash: string;
  storage_key: string;
};

export async function finalizeCompletedEnvelope(envelopeId: string) {
  const connection = await getMysqlPool().getConnection();
  const stored: string[] = [];
  try {
    await connection.beginTransaction();
    const [envelopes] = await connection.query<
      Array<RowDataPacket & { status: string; completed_at: string | Date }>
    >('SELECT status, completed_at FROM envelopes WHERE id = ? FOR UPDATE', [envelopeId]);
    const envelope = envelopes[0];
    if (!envelope || envelope.status !== 'completed' || !envelope.completed_at)
      throw new Error('The document is not complete.');
    const [incomplete] = await connection.query<
      Array<RowDataPacket & { count: number }>
    >(
      `SELECT COUNT(*) AS count FROM signers
       WHERE envelope_id = ? AND is_required = TRUE AND status <> 'signed'`,
      [envelopeId],
    );
    if (Number(incomplete[0]?.count) !== 0)
      throw new Error('A required signer has not completed.');
    const [existing] = await connection.query<ArchiveRow[]>(
      'SELECT * FROM final_archives WHERE envelope_id = ? LIMIT 1',
      [envelopeId],
    );
    if (existing[0]) {
      await connection.commit();
      return existing[0];
    }
    const [documents] = await connection.query<
      Array<RowDataPacket & {
        id: string;
        version_kind: ArchiveVersion['kind'];
        document_hash: string;
        storage_key: string;
      }>
    >(
      `SELECT id, version_kind, document_hash, storage_key FROM document_versions
       WHERE envelope_id = ? AND version_kind IN ('prepared', 'presented', 'intermediate', 'final')
       ORDER BY created_at, id`,
      [envelopeId],
    );
    const versions: ArchiveVersion[] = [];
    for (const document of documents) {
      const bytes = await readPrivateObject(document.storage_key);
      if (sha256(bytes) !== document.document_hash)
        throw new Error(`Document version ${document.id} failed verification.`);
      versions.push({
        id: document.id,
        kind: document.version_kind,
        hash: document.document_hash,
        bytes,
      });
    }
    const [events] = await connection.query<
      Array<RowDataPacket & {
        signer_id: string;
        signer_role: string;
        name_encrypted: string;
        signed_at: string | Date;
        signature_method: 'typed' | 'drawn';
        consent_text_version: string;
        presented_document_hash: string;
      }>
    >(
      `SELECT se.signer_id, s.signer_role, s.name_encrypted, se.signed_at,
              se.signature_method, se.consent_text_version, se.presented_document_hash
       FROM signature_events se JOIN signers s ON s.id = se.signer_id
       WHERE se.envelope_id = ? ORDER BY se.signed_at, se.id`,
      [envelopeId],
    );
    const result = await buildFinalArchive({
      envelopeId,
      completedAt: fromMysqlUtc(envelope.completed_at).toISOString(),
      versions,
      events: events.map((event) => ({
        signerId: event.signer_id,
        name: decryptValue(event.name_encrypted, `signer:${event.signer_id}:name`),
        role: event.signer_role,
        signedAt: fromMysqlUtc(event.signed_at).toISOString(),
        method: event.signature_method,
        consentVersion: event.consent_text_version,
        presentedHash: event.presented_document_hash,
      })),
    });
    const certificateKey = await storePrivateObject(
      'documents', envelopeId, 'pdf', result.certificate,
    );
    stored.push(certificateKey);
    const archiveKey = await storePrivateObject(
      'documents', envelopeId, 'zip', result.archive,
    );
    stored.push(archiveKey);
    if (
      sha256(await readPrivateObject(certificateKey)) !== result.certificateHash ||
      sha256(await readPrivateObject(archiveKey)) !== result.archiveHash
    )
      throw new Error('Final archive failed storage verification.');
    const final = versions.find((version) => version.kind === 'final')!;
    await connection.execute(
      `INSERT INTO document_versions
       (id, envelope_id, version_kind, source_hash, document_hash, storage_key, byte_length, created_at)
       VALUES (?, ?, 'audit_certificate', NULL, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [randomUUID(), envelopeId, result.certificateHash, certificateKey, result.certificate.length],
    );
    await connection.execute(
      `INSERT INTO final_archives
       (id, envelope_id, final_document_id, final_document_hash, certificate_hash,
        archive_hash, storage_key, byte_length, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))`,
      [
        randomUUID(), envelopeId, final.id, result.finalHash,
        result.certificateHash, result.archiveHash, archiveKey, result.archive.length,
      ],
    );
    await connection.commit();
    return {
      archive_hash: result.archiveHash,
      certificate_hash: result.certificateHash,
      final_document_hash: result.finalHash,
      storage_key: archiveKey,
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    for (const key of stored)
      await removePrivateObject(key).catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

export async function readVerifiedFinalArchive(envelopeId: string) {
  const record = await finalizeCompletedEnvelope(envelopeId);
  const bytes = await readPrivateObject(record.storage_key);
  if (sha256(bytes) !== record.archive_hash)
    throw new Error('Final archive checksum does not match its database record.');
  verifyFinalArchive(bytes, record.final_document_hash, record.certificate_hash);
  return { bytes, hash: record.archive_hash };
}
