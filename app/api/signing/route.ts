import { getRecipientSession } from '@/lib/recipient-session';
import { assertSameOrigin } from '@/lib/request-security';
import {
  declineDocument,
  markViewed,
  submitSignature,
  validateSigningInput,
} from '@/lib/signing-actions';
import { dispatchInvitations } from '@/lib/signing-mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  try {
    const body = (await request.json()) as {
      action?: string;
      submission?: unknown;
    };
    const session = await getRecipientSession(body.action === 'submit');
    if (!session)
      return Response.json(
        { error: 'Signing session expired. Reopen your invitation.' },
        { status: 401 },
      );
    if (body.action === 'view') {
      await markViewed(session);
      return Response.json({ ok: true });
    }
    if (body.action === 'decline') {
      const status = await declineDocument(session, request);
      await dispatchInvitations().catch(() => undefined);
      return Response.json({ ok: true, status });
    }
    if (body.action === 'submit') {
      const result = await submitSignature(
        session,
        validateSigningInput(body.submission),
        request,
      );
      if (result.status !== 'already_signed')
        await dispatchInvitations().catch(() => undefined);
      return Response.json({ ok: true, ...result });
    }
    return Response.json({ error: 'Unknown signing action.' }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Signing failed.' },
      { status: 400 },
    );
  }
}
