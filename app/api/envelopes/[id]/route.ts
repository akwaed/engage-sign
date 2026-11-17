import type { RowDataPacket } from 'mysql2/promise';

import { appendAuditEvent } from '@/lib/audit';
import {
  canReadAllDocuments,
  canReadEnvelope,
  canSendDocuments,
} from '@/lib/auth/rbac';
import { getStaffUser } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';
import {
  saveDraft,
  sendDraft,
  validateEnvelopeInput,
  voidEnvelope,
} from '@/lib/envelopes';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';
import {
  dispatchInvitations,
  resetFailedNotifications,
} from '@/lib/signing-mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const actor = await getStaffUser();
  if (!actor || !canSendDocuments(actor))
    return Response.json(
      { error: 'You do not have access to that document.' },
      { status: 403 },
    );
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
  const allowAnyOwner = canReadAllDocuments(actor);
  try {
    const body = (await request.json()) as { action?: string; input?: unknown };
    let status = 'draft';
    let details: Record<string, unknown> = {};
    if (body.action === 'update') {
      await saveDraft(
        validateEnvelopeInput(body.input),
        actor.id,
        id,
        allowAnyOwner,
      );
    } else if (body.action === 'send') {
      const result = await sendDraft(id, actor.id, allowAnyOwner);
      status = 'sent';
      const notifications = await dispatchInvitations().catch(() => []);
      details = {
        preparedHash: result.hash,
        notificationsSent: notifications.filter((item) => item.sent).length,
      };
    } else if (body.action === 'void') {
      await voidEnvelope(id, actor.id, allowAnyOwner);
      await dispatchInvitations().catch(() => undefined);
      status = 'voided';
    } else if (body.action === 'retry_notifications') {
      await resetFailedNotifications(id);
      const notifications = await dispatchInvitations();
      details = {
        notificationsSent: notifications.filter((item) => item.sent).length,
      };
      status = 'unchanged';
    } else
      return Response.json(
        { error: 'Unknown document action.' },
        { status: 400 },
      );
    await appendAuditEvent({
      actorType: 'user',
      actorId: actor.id,
      envelopeId: id,
      eventType: `DOCUMENT_${body.action.toUpperCase()}`,
      details,
      ipHash: hashClientIp(getClientIp(request)),
      userAgent: request.headers.get('user-agent'),
    });
    return Response.json({ ok: true, id, status, ...details });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Document action failed.',
      },
      { status: 400 },
    );
  }
}
