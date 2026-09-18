import { NextResponse } from 'next/server';

import { appendAuditEvent } from '@/lib/audit';
import {
  expiredSessionCookie,
  getStaffUser,
  revokeCurrentSession,
} from '@/lib/auth/session';
import {
  assertSameOrigin,
  getClientIp,
  hashClientIp,
} from '@/lib/request-security';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const user = await getStaffUser();
  await revokeCurrentSession();
  if (user)
    await appendAuditEvent({
      actorType: 'user',
      actorId: user.id,
      eventType: 'STAFF_LOGOUT',
      ipHash: hashClientIp(getClientIp(request)),
      userAgent: request.headers.get('user-agent'),
    });
  const response = NextResponse.redirect(new URL('/login', request.url), 303);
  response.cookies.set(expiredSessionCookie());
  return response;
}
