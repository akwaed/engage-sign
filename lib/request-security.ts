import 'server-only';

import { createHmac } from 'node:crypto';

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    throw new Error('The request origin could not be verified.');
  }
}

export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip');
}

export function hashClientIp(ipAddress: string | null): string | null {
  if (!ipAddress) return null;
  const secret = process.env.IP_HASH_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(ipAddress).digest('hex');
}
