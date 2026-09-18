import { env } from 'cloudflare:workers';
import { asc, desc, eq } from 'drizzle-orm';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getDb } from '@/db';
import {
  auditEvents,
  documentVersions,
  envelopes,
  fieldValues,
  legalExports,
  signatureEvents,
  signers,
  systemSettings,
  templateFields,
  templates as templateRecords,
  templateVersions,
  users,
} from '@/db/schema';
import {
  buildLegalArchive,
  sha256Hex,
  type ArchiveDocument,
  type ArchiveTemplateSource,
} from '@/lib/legal-export';
import { templateCatalog } from '@/lib/template-catalog';

export const dynamic = 'force-dynamic';

class AccessDeniedError extends Error {}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json({ error: 'Sign in is required.' }, { status: 401 });

  const exportId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const records = await loadRecords({
      exportId,
      createdAt,
      userId: user.userId,
      userAgent: request.headers.get('user-agent'),
    });
    const documents = await loadDocumentFiles(records.documentVersions);
    const templateSourceFiles = await loadTemplateSourceFiles(
      records.templateVersions,
    );
    const archive = await buildLegalArchive({
      exportId,
      createdAt,
      requestedBy: { userId: user.userId, email: user.email },
      templates: templateCatalog,
      templateRecords: records.templateRecords,
      templateVersions: records.templateVersions,
      templateFields: records.templateFields,
      envelopes: records.envelopes,
      signers: records.signers,
      fieldValues: records.fieldValues,
      signatureEvents: records.signatureEvents,
      auditEvents: records.auditEvents,
      documents,
      templateSourceFiles,
      settings: records.settings,
      exportHistory: records.exportHistory,
    });

    await recordCompletedExport({
      exportId,
      createdAt,
      userId: user.userId,
      userAgent: request.headers.get('user-agent'),
      manifestHash: archive.manifestHash,
      archiveHash: archive.archiveHash,
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
    if (error instanceof AccessDeniedError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    const message =
      error instanceof Error ? error.message : 'Legal export failed.';
    return Response.json({ error: message }, { status: 500 });
  }
}

async function loadRecords(input: {
  exportId: string;
  createdAt: string;
  userId: string;
  userAgent: string | null;
}) {
  const db = getDb();
  try {
    const [appUser] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (input.userId !== 'local_seedy' && appUser?.role !== 'admin') {
      throw new AccessDeniedError(
        'Only an administrator can create a complete legal archive.',
      );
    }

    const [previous] = await db
      .select({ eventHash: auditEvents.eventHash })
      .from(auditEvents)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(1);
    const requestedEvent = await createAuditEvent({
      id: crypto.randomUUID(),
      actorId: input.userId,
      eventType: 'LEGAL_EXPORT_REQUESTED',
      detailsJson: JSON.stringify({
        exportId: input.exportId,
        scope: 'all_documents_and_logs',
      }),
      userAgent: input.userAgent,
      occurredAt: input.createdAt,
      previousHash: previous?.eventHash ?? null,
    });
    await db.insert(auditEvents).values(requestedEvent);

    const [
      allTemplateRecords,
      allTemplateVersions,
      allTemplateFields,
      allEnvelopes,
      allSigners,
      allFieldValues,
      allSignatureEvents,
      allAuditEvents,
      allDocumentVersions,
      allSettings,
      allExportHistory,
    ] = await Promise.all([
      db.select().from(templateRecords).orderBy(asc(templateRecords.createdAt)),
      db
        .select()
        .from(templateVersions)
        .orderBy(
          asc(templateVersions.templateId),
          asc(templateVersions.versionNumber),
        ),
      db
        .select()
        .from(templateFields)
        .orderBy(
          asc(templateFields.templateVersionId),
          asc(templateFields.displayOrder),
        ),
      db.select().from(envelopes).orderBy(asc(envelopes.createdAt)),
      db
        .select()
        .from(signers)
        .orderBy(asc(signers.envelopeId), asc(signers.routingOrder)),
      db
        .select()
        .from(fieldValues)
        .orderBy(asc(fieldValues.envelopeId), asc(fieldValues.createdAt)),
      db.select().from(signatureEvents).orderBy(asc(signatureEvents.signedAt)),
      db.select().from(auditEvents).orderBy(asc(auditEvents.occurredAt)),
      db
        .select()
        .from(documentVersions)
        .orderBy(asc(documentVersions.createdAt)),
      db.select().from(systemSettings).orderBy(asc(systemSettings.updatedAt)),
      db.select().from(legalExports).orderBy(asc(legalExports.createdAt)),
    ]);

    return {
      templateRecords: allTemplateRecords,
      templateVersions: allTemplateVersions,
      templateFields: allTemplateFields,
      envelopes: allEnvelopes,
      signers: allSigners,
      fieldValues: allFieldValues,
      signatureEvents: allSignatureEvents,
      auditEvents: allAuditEvents,
      documentVersions: allDocumentVersions,
      settings: allSettings,
      exportHistory: allExportHistory,
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) throw error;
    if (input.userId !== 'local_seedy') {
      throw new Error(
        'The signing database is not initialized. Run the generated migration before exporting.',
      );
    }

    const fallbackEvent = await createAuditEvent({
      id: crypto.randomUUID(),
      actorId: input.userId,
      eventType: 'LEGAL_EXPORT_REQUESTED',
      detailsJson: JSON.stringify({
        exportId: input.exportId,
        scope: 'baseline_catalog',
        localPreview: true,
      }),
      userAgent: input.userAgent,
      occurredAt: input.createdAt,
      previousHash: null,
    });
    return {
      templateRecords: [],
      templateVersions: [],
      templateFields: [],
      envelopes: [],
      signers: [],
      fieldValues: [],
      signatureEvents: [],
      auditEvents: [fallbackEvent],
      documentVersions: [],
      settings: [],
      exportHistory: [],
    };
  }
}

async function loadTemplateSourceFiles(
  versions: Array<typeof templateVersions.$inferSelect>,
): Promise<ArchiveTemplateSource[]> {
  const files: ArchiveTemplateSource[] = [];
  for (const version of versions) {
    const object = await env.FILES.get(version.sourceStorageKey);
    if (!object) {
      throw new Error(
        `Archive stopped: source template ${version.id} is missing from private storage.`,
      );
    }
    const data = new Uint8Array(await object.arrayBuffer());
    const actualHash = await sha256Hex(data);
    if (actualHash !== version.sourceHash) {
      throw new Error(
        `Archive stopped: source template ${version.id} failed its checksum verification.`,
      );
    }
    files.push({
      templateVersionId: version.id,
      templateId: version.templateId,
      storageKey: version.sourceStorageKey,
      recordedHash: version.sourceHash,
      data,
    });
  }
  return files;
}

async function loadDocumentFiles(
  versions: Array<typeof documentVersions.$inferSelect>,
): Promise<ArchiveDocument[]> {
  const files: ArchiveDocument[] = [];
  for (const version of versions) {
    const object = await env.FILES.get(version.storageKey);
    if (!object)
      throw new Error(
        `Archive stopped: document file ${version.id} is missing from private storage.`,
      );
    const data = new Uint8Array(await object.arrayBuffer());
    const actualHash = await sha256Hex(data);
    if (actualHash !== version.documentHash) {
      throw new Error(
        `Archive stopped: document file ${version.id} failed its checksum verification.`,
      );
    }
    files.push({
      id: version.id,
      envelopeId: version.envelopeId,
      versionKind: version.versionKind,
      storageKey: version.storageKey,
      recordedHash: version.documentHash,
      data,
    });
  }
  return files;
}

async function recordCompletedExport(input: {
  exportId: string;
  createdAt: string;
  userId: string;
  userAgent: string | null;
  manifestHash: string;
  archiveHash: string;
}) {
  const db = getDb();
  try {
    await db.insert(legalExports).values({
      id: input.exportId,
      createdBy: input.userId,
      scopeJson: JSON.stringify({ scope: 'all_documents_and_logs' }),
      manifestHash: input.manifestHash,
      archiveHash: input.archiveHash,
      storageKey: null,
      createdAt: input.createdAt,
    });
    const [previous] = await db
      .select({ eventHash: auditEvents.eventHash })
      .from(auditEvents)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(1);
    const completedEvent = await createAuditEvent({
      id: crypto.randomUUID(),
      actorId: input.userId,
      eventType: 'LEGAL_EXPORT_COMPLETED',
      detailsJson: JSON.stringify({
        exportId: input.exportId,
        manifestHash: input.manifestHash,
        archiveHash: input.archiveHash,
      }),
      userAgent: input.userAgent,
      occurredAt: new Date().toISOString(),
      previousHash: previous?.eventHash ?? null,
    });
    await db.insert(auditEvents).values(completedEvent);
  } catch {
    if (input.userId !== 'local_seedy')
      throw new Error(
        'The archive was created, but its completion record could not be saved.',
      );
  }
}

async function createAuditEvent(input: {
  id: string;
  actorId: string;
  eventType: string;
  detailsJson: string;
  userAgent: string | null;
  occurredAt: string;
  previousHash: string | null;
}) {
  const eventHash = await sha256Hex(
    JSON.stringify({
      id: input.id,
      envelopeId: null,
      actorType: 'user',
      actorId: input.actorId,
      eventType: input.eventType,
      detailsJson: input.detailsJson,
      ipAddressEncrypted: null,
      userAgent: input.userAgent,
      occurredAt: input.occurredAt,
      previousHash: input.previousHash,
    }),
  );
  return {
    id: input.id,
    envelopeId: null,
    actorType: 'user' as const,
    actorId: input.actorId,
    eventType: input.eventType,
    detailsJson: input.detailsJson,
    ipAddressEncrypted: null,
    userAgent: input.userAgent,
    occurredAt: input.occurredAt,
    previousHash: input.previousHash,
    eventHash,
  };
}
