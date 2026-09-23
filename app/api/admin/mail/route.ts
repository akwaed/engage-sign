import { getStaffUser } from '@/lib/auth/session';
import { expireDueEnvelopes } from '@/lib/envelope-expiration';
import { safeErrorCode } from '@/lib/mail-security';
import { assertSameOrigin } from '@/lib/request-security';
import {
  dispatchNotifications,
  queueDueReminders,
  resetFailedNotifications,
  verifyMailConnection,
} from '@/lib/signing-mail';

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
    return Response.json({ error: 'Administrator access is required.' }, { status: 403 });
  try {
    const body = (await request.json()) as { action?: string; envelopeId?: string };
    if (body.action === 'verify') {
      try {
        console.info('SMTP_VERIFY_START');
        await verifyMailConnection();
        console.info('SMTP_VERIFY_OK');
        return Response.json({ ok: true, message: 'SMTP connection and authentication succeeded.' });
      } catch (error) {
        const code = safeErrorCode(error);
        const status = error && typeof error === 'object' && 'responseCode' in error
          ? Number(error.responseCode) : null;
        console.warn(`SMTP_VERIFY_FAILED code=${code} status=${Number.isInteger(status) ? status : 'none'}`);
        return Response.json({
          error: `SMTP verification failed (${code}${Number.isInteger(status) ? `, status ${status}` : ''}).`,
        }, { status: 502 });
      }
    }
    if (body.action === 'retry') {
      if (!/^[a-f0-9-]{36}$/i.test(body.envelopeId ?? ''))
        return Response.json({ error: 'Invalid document ID.' }, { status: 400 });
      const reset = await resetFailedNotifications(body.envelopeId!);
      const results = await dispatchNotifications();
      return Response.json({ ok: true, reset, sent: results.filter((item) => item.sent).length });
    }
    if (body.action === 'run') {
      const expired = await expireDueEnvelopes();
      const reminders = await queueDueReminders();
      const results = await dispatchNotifications(25);
      return Response.json({
        ok: true,
        expired,
        reminders,
        sent: results.filter((item) => item.sent).length,
        failed: results.filter((item) => !item.sent).length,
      });
    }
    return Response.json({ error: 'Unknown mail action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error && /required|HTTPS|SMTP_PORT/.test(error.message)
      ? error.message : 'Mail operation failed. See delivery records.';
    return Response.json({ error: message }, { status: 500 });
  }
}
