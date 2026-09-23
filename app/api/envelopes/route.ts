import { appendAuditEvent } from '@/lib/audit';
import { getStaffUser } from '@/lib/auth/session';
import { saveDraft, sendDraft, validateEnvelopeInput } from '@/lib/envelopes';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';
import { dispatchInvitations } from '@/lib/signing-mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const actor = await getStaffUser();
  if (!actor || actor.role !== 'admin')
    return Response.json(
      { error: 'Administrator access is required.' },
      { status: 403 },
    );
  let id: string | null = null;
  try {
    const body = (await request.json()) as {
      input?: unknown;
      sendNow?: boolean;
    };
    const input = validateEnvelopeInput(body.input);
    id = await saveDraft(input, actor.id);
    await appendAuditEvent({
      actorType: 'user',
      actorId: actor.id,
      envelopeId: id,
      eventType: 'DOCUMENT_DRAFT_CREATED',
      details: { templateVersionId: input.templateVersionId },
      ipHash: hashClientIp(getClientIp(request)),
      userAgent: request.headers.get('user-agent'),
    });
    if (!body.sendNow) return Response.json({ ok: true, id, status: 'draft' });
    const sent = await sendDraft(id, actor.id);
    const notifications = await dispatchInvitations().catch(() => []);
    await appendAuditEvent({
      actorType: 'user',
      actorId: actor.id,
      envelopeId: id,
      eventType: 'DOCUMENT_SENT',
      details: {
        preparedHash: sent.hash,
        notificationsSent: notifications.filter((item) => item.sent).length,
      },
      ipHash: hashClientIp(getClientIp(request)),
      userAgent: request.headers.get('user-agent'),
    });
    return Response.json({ ok: true, id, status: 'sent', notifications });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Document could not be saved.',
        draftId: id,
      },
      { status: 400 },
    );
  }
}
