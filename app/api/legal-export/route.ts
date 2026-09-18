import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import { getStaffUser } from '@/lib/auth/session';
import {
  buildLegalArchive,
  sha256Hex,
  type ArchiveDocument,
  type ArchiveTemplateSource,
} from '@/lib/legal-export';
import { getMysqlPool } from '@/lib/mysql';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';
import { templateCatalog } from '@/lib/template-catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RecordRow = RowDataPacket & Record<string, unknown>;
type TemplateVersionRow = RecordRow & {
  id: string;
  template_id: string;
  source_hash: string;
  source_storage_key: string;
};
type DocumentVersionRow = RecordRow & {
  id: string;
  envelope_id: string;
  version_kind: string;
  document_hash: string;
  storage_key: string;
};

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json(
      { error: 'The request origin could not be verified.' },
      { status: 403 },
    );
  }
  const user = await getStaffUser();
  if (!user)
    return Response.json({ error: 'Sign in is required.' }, { status: 401 });
  if (user.role !== 'admin')
    return Response.json(
      { error: 'Administrator access is required.' },
      { status: 403 },
    );

  const exportId = randomUUID();
  const createdAt = new Date().toISOString();
  const userAgent = request.headers.get('user-agent');
  const ipHash = hashClientIp(getClientIp(request));

  try {
    await appendAuditEvent({
      actorType: 'user',
      actorId: user.id,
      eventType: 'LEGAL_EXPORT_REQUESTED',
      details: { exportId, scope: 'all_documents_and_logs' },
      ipHash,
      userAgent,
    });
    const records = await loadRecords();
    const documents = await loadDocumentFiles(records.documentVersions);
    const templateSourceFiles = await loadTemplateSourceFiles(
      records.templateVersions,
    );
    const archive = await buildLegalArchive({
      exportId,
      createdAt,
      requestedBy: { userId: user.id, email: user.email },
      templates: templateCatalog,
      staffUsers: records.staffUsers,
      templateRecords: records.templateRecords,
      templateVersions: records.templateVersions,
      templateFields: records.templateFields,
      envelopes: records.envelopes,
      signers: records.signers,
      fieldValues: records.fieldValues,
      signatureEvents: records.signatureEvents,
      auditEvents: records.auditEvents.map((row) => ({
        ...row,
        eventHash: row.event_hash,
      })),
      documents,
      templateSourceFiles,
      settings: records.settings,
      exportHistory: records.exportHistory,
    });

    await getMysqlPool().execute<ResultSetHeader>(
      `INSERT INTO legal_exports
        (id, created_by, scope_json, manifest_hash, archive_hash, storage_key, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, UTC_TIMESTAMP(6))`,
      [
        exportId,
        user.id,
        JSON.stringify({ scope: 'all_documents_and_logs' }),
        archive.manifestHash,
        archive.archiveHash,
      ],
    );
    await appendAuditEvent({
      actorType: 'user',
      actorId: user.id,
      eventType: 'LEGAL_EXPORT_COMPLETED',
      details: {
        exportId,
        manifestHash: archive.manifestHash,
        archiveHash: archive.archiveHash,
      },
      ipHash,
      userAgent,
    });

    return new Response(archive.bytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${archive.filename}"`,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
        'X-Export-Id': exportId,
        'X-Archive-SHA256': archive.archiveHash,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Legal export failed.';
    return Response.json({ error: message }, { status: 500 });
  }
}

async function loadRecords() {
  const pool = getMysqlPool();
  const [
    [staffUsers],
    [templateRecords],
    [templateVersions],
    [templateFields],
    [envelopes],
    [signers],
    [fieldValues],
    [signatureEvents],
    [auditEvents],
    [documentVersions],
    [settings],
    [exportHistory],
  ] = await Promise.all([
    pool.query<RecordRow[]>(
      'SELECT id, email, display_name, role, status, created_at, updated_at FROM users ORDER BY created_at',
    ),
    pool.query<RecordRow[]>('SELECT * FROM templates ORDER BY created_at'),
    pool.query<TemplateVersionRow[]>(
      'SELECT * FROM template_versions ORDER BY template_id, version_number',
    ),
    pool.query<RecordRow[]>(
      'SELECT * FROM template_fields ORDER BY template_version_id, display_order',
    ),
    pool.query<RecordRow[]>('SELECT * FROM envelopes ORDER BY created_at'),
    pool.query<RecordRow[]>(
      'SELECT * FROM signers ORDER BY envelope_id, routing_order',
    ),
    pool.query<RecordRow[]>(
      'SELECT * FROM field_values ORDER BY envelope_id, created_at',
    ),
    pool.query<RecordRow[]>(
      'SELECT * FROM signature_events ORDER BY signed_at',
    ),
    pool.query<RecordRow[]>(
      'SELECT * FROM audit_events ORDER BY occurred_at, id',
    ),
    pool.query<DocumentVersionRow[]>(
      'SELECT * FROM document_versions ORDER BY created_at',
    ),
    pool.query<RecordRow[]>(
      'SELECT * FROM system_settings ORDER BY updated_at',
    ),
    pool.query<RecordRow[]>('SELECT * FROM legal_exports ORDER BY created_at'),
  ]);
  return {
    staffUsers,
    templateRecords,
    templateVersions,
    templateFields,
    envelopes,
    signers,
    fieldValues,
    signatureEvents,
    auditEvents,
    documentVersions,
    settings,
    exportHistory,
  };
}

async function loadTemplateSourceFiles(
  versions: TemplateVersionRow[],
): Promise<ArchiveTemplateSource[]> {
  const files: ArchiveTemplateSource[] = [];
  for (const version of versions) {
    const data = await readPrivateFile(
      version.source_storage_key,
      `source template ${version.id}`,
    );
    const actualHash = await sha256Hex(data);
    if (actualHash !== version.source_hash)
      throw new Error(
        `Archive stopped: source template ${version.id} failed its checksum verification.`,
      );
    files.push({
      templateVersionId: version.id,
      templateId: version.template_id,
      storageKey: version.source_storage_key,
      recordedHash: version.source_hash,
      data,
    });
  }
  return files;
}

async function loadDocumentFiles(
  versions: DocumentVersionRow[],
): Promise<ArchiveDocument[]> {
  const files: ArchiveDocument[] = [];
  for (const version of versions) {
    const data = await readPrivateFile(
      version.storage_key,
      `document file ${version.id}`,
    );
    const actualHash = await sha256Hex(data);
    if (actualHash !== version.document_hash)
      throw new Error(
        `Archive stopped: document file ${version.id} failed its checksum verification.`,
      );
    files.push({
      id: version.id,
      envelopeId: version.envelope_id,
      versionKind: version.version_kind,
      storageKey: version.storage_key,
      recordedHash: version.document_hash,
      data,
    });
  }
  return files;
}

async function readPrivateFile(
  storageKey: string,
  label: string,
): Promise<Uint8Array> {
  const rootSetting = process.env.PRIVATE_STORAGE_PATH;
  if (!rootSetting)
    throw new Error(
      'Private document storage is not configured. Set PRIVATE_STORAGE_PATH.',
    );
  if (isAbsolute(storageKey))
    throw new Error(`Archive stopped: ${label} has an invalid storage path.`);
  const root = resolve(rootSetting);
  const filePath = resolve(root, storageKey);
  const relativePath = relative(root, filePath);
  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  )
    throw new Error(`Archive stopped: ${label} has an invalid storage path.`);
  try {
    return new Uint8Array(await readFile(filePath));
  } catch {
    throw new Error(
      `Archive stopped: ${label} is missing from private storage.`,
    );
  }
}
