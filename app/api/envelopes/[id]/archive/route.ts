import type { RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import { canReadEnvelope } from '@/lib/auth/rbac';
import { getStaffUser } from '@/lib/auth/session';
import { readVerifiedFinalArchive } from '@/lib/finalization';
import { getMysqlPool } from '@/lib/mysql';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const actor = await getStaffUser();
  if (!actor)
    return Response.json({ error: 'Sign in is required.' }, { status: 401 });
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return Response.json({ error: 'Invalid document ID.' }, { status: 400 });
  const [owners] = await getMysqlPool().query<
    Array<RowDataPacket & { created_by: string }>
  >('SELECT created_by FROM envelopes WHERE id = ? LIMIT 1', [id]);
  if (!owners[0] || !canReadEnvelope(actor, owners[0].created_by))
    return Response.json(
      { error: 'You do not have access to that document.' },
      { status: 403 },
    );
  try {
    const archive = await readVerifiedFinalArchive(id);
    await appendAuditEvent({
      actorType: 'user',
      actorId: actor.id,
      envelopeId: id,
      eventType: 'DOCUMENT_DOWNLOADED',
      details: { kind: 'final_archive', sha256: archive.hash },
      ipHash: hashClientIp(getClientIp(request)),
      userAgent: request.headers.get('user-agent'),
    });
    return new Response(Uint8Array.from(archive.bytes).buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="engage-sign-final-${id}.zip"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Archive-SHA256': archive.hash,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Final archive unavailable.',
      },
      { status: 409 },
    );
  }
}
