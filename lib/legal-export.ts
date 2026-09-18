import { strToU8, zipSync } from 'fflate';

import type { TemplateCatalogItem } from '@/lib/template-catalog';

export type ArchiveDocument = {
  id: string;
  envelopeId: string;
  versionKind: string;
  storageKey: string;
  recordedHash: string;
  data: Uint8Array;
};

export type ArchiveTemplateSource = {
  templateVersionId: string;
  templateId: string;
  storageKey: string;
  recordedHash: string;
  data: Uint8Array;
};

export type LegalArchiveInput = {
  exportId: string;
  createdAt: string;
  requestedBy: { userId: string; email: string };
  templates: TemplateCatalogItem[];
  staffUsers: unknown[];
  templateRecords: unknown[];
  templateVersions: unknown[];
  templateFields: unknown[];
  envelopes: unknown[];
  signers: unknown[];
  fieldValues: unknown[];
  signatureEvents: unknown[];
  auditEvents: Array<{ eventHash?: string | null; [key: string]: unknown }>;
  documents: ArchiveDocument[];
  templateSourceFiles: ArchiveTemplateSource[];
  settings: unknown[];
  exportHistory: unknown[];
};

export type LegalArchiveResult = {
  bytes: Uint8Array;
  manifestHash: string;
  archiveHash: string;
  filename: string;
};

export async function buildLegalArchive(
  input: LegalArchiveInput,
): Promise<LegalArchiveResult> {
  const entries: Record<string, Uint8Array> = {
    'README.txt': strToU8(readmeText(input)),
    'records/templates.json': jsonBytes(input.templates),
    'records/staff-users.json': jsonBytes(input.staffUsers),
    'records/database-templates.json': jsonBytes(input.templateRecords),
    'records/template-versions.json': jsonBytes(input.templateVersions),
    'records/template-fields.json': jsonBytes(input.templateFields),
    'records/envelopes.json': jsonBytes(input.envelopes),
    'records/signers.json': jsonBytes(input.signers),
    'records/field-values.json': jsonBytes(input.fieldValues),
    'records/signature-events.json': jsonBytes(input.signatureEvents),
    'records/system-settings.json': jsonBytes(input.settings),
    'records/export-history.json': jsonBytes(input.exportHistory),
    'audit/events.ndjson': strToU8(
      input.auditEvents.map((event) => JSON.stringify(event)).join('\n') +
        (input.auditEvents.length ? '\n' : ''),
    ),
  };

  const documentRecords: Array<Record<string, unknown>> = [];
  for (const document of input.documents) {
    const extension = safeExtension(document.storageKey);
    const path = `documents/${safeSegment(document.envelopeId)}/${safeSegment(document.id)}${extension}`;
    const actualHash = await sha256Hex(document.data);
    entries[path] = document.data;
    documentRecords.push({
      id: document.id,
      envelopeId: document.envelopeId,
      versionKind: document.versionKind,
      archivePath: path,
      recordedHash: document.recordedHash,
      exportedHash: actualHash,
      hashMatchesRecord: actualHash === document.recordedHash,
    });
  }
  entries['records/document-index.json'] = jsonBytes(documentRecords);

  const templateSourceRecords: Array<Record<string, unknown>> = [];
  for (const source of input.templateSourceFiles) {
    const extension = safeExtension(source.storageKey);
    const path = `templates/source/${safeSegment(source.templateVersionId)}${extension}`;
    const actualHash = await sha256Hex(source.data);
    entries[path] = source.data;
    templateSourceRecords.push({
      templateVersionId: source.templateVersionId,
      templateId: source.templateId,
      archivePath: path,
      recordedHash: source.recordedHash,
      exportedHash: actualHash,
      hashMatchesRecord: actualHash === source.recordedHash,
    });
  }
  entries['records/template-source-index.json'] = jsonBytes(
    templateSourceRecords,
  );

  const entryChecksums: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(entries))
    entryChecksums[path] = await sha256Hex(bytes);

  const lastAuditEvent = input.auditEvents.at(-1);
  const manifest = {
    format: 'engage-sign-legal-archive',
    formatVersion: 1,
    exportId: input.exportId,
    createdAt: input.createdAt,
    requestedBy: input.requestedBy,
    scope: 'all_documents_and_logs',
    hashAlgorithm: 'SHA-256',
    auditChainTip:
      typeof lastAuditEvent?.eventHash === 'string'
        ? lastAuditEvent.eventHash
        : null,
    counts: {
      templates: input.templates.length,
      staffUsers: input.staffUsers.length,
      storedTemplateVersions: input.templateVersions.length,
      templateSourceFiles: templateSourceRecords.length,
      envelopes: input.envelopes.length,
      signers: input.signers.length,
      fieldValues: input.fieldValues.length,
      signatureEvents: input.signatureEvents.length,
      auditEvents: input.auditEvents.length,
      documentFiles: documentRecords.length,
    },
    entries: entryChecksums,
    notes: [
      'The ZIP checksum is returned in the download response header and recorded server-side.',
      'checksums.sha256 covers every payload entry plus manifest.json; it intentionally excludes itself.',
    ],
  };

  entries['manifest.json'] = jsonBytes(manifest);
  const manifestHash = await sha256Hex(entries['manifest.json']);
  const checksumLines = [
    ...Object.entries(entryChecksums),
    ['manifest.json', manifestHash],
  ]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, hash]) => `${hash}  ${path}`)
    .join('\n');
  entries['checksums.sha256'] = strToU8(`${checksumLines}\n`);

  const bytes = zipSync(entries, {
    level: 6,
    mtime: new Date(input.createdAt),
  });
  const archiveHash = await sha256Hex(bytes);
  const date = input.createdAt.slice(0, 10);
  return {
    bytes,
    manifestHash,
    archiveHash,
    filename: `engage-sign-legal-archive-${date}.zip`,
  };
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestInput);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function safeExtension(storageKey: string): string {
  const match = storageKey.toLowerCase().match(/\.(pdf|docx|png|jpg|jpeg)$/);
  return match ? match[0] : '.bin';
}

function readmeText(input: LegalArchiveInput): string {
  return [
    'Engage Sign legal archive',
    '',
    `Export ID: ${input.exportId}`,
    `Created: ${input.createdAt}`,
    '',
    'Contents',
    '- manifest.json: export identity, counts, audit-chain tip, and per-entry hashes',
    '- checksums.sha256: SHA-256 hashes for archive payload files',
    '- records/: structured document, signer, signature, and template records',
    '- audit/events.ndjson: append-only audit events in chronological order',
    '- documents/: every archived prepared, presented, final, and certificate file available to the system',
    '',
    'Verification',
    '1. Calculate SHA-256 for each listed file and compare it with checksums.sha256.',
    '2. Preserve the ZIP byte-for-byte. The server records the ZIP checksum separately.',
    '3. Keep this package in encrypted offsite storage because it may contain sensitive personal data.',
    '',
    'This export preserves evidence; it is not legal advice or a substitute for counsel review.',
    '',
  ].join('\n');
}
