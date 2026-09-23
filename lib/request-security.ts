import 'server-only';

import { createHmac } from 'node:crypto';

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || normalizeOrigin(origin) !== getPublicOrigin(request)) {
    throw new Error('The request origin could not be verified.');
  }
}

export function getPublicOrigin(request: Request) {
  const forwardedHost = firstHeaderValue(
    request.headers.get('x-forwarded-host'),
  );
  const forwardedProtocol = firstHeaderValue(
    request.headers.get('x-forwarded-proto'),
  );
  if (
    forwardedHost &&
    /^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d+)?$/i.test(forwardedHost) &&
    (forwardedProtocol === 'http' || forwardedProtocol === 'https')
  ) {
    return `${forwardedProtocol}://${forwardedHost}`;
  }

  const configuredOrigin = normalizeOrigin(process.env.APP_URL ?? '');
  if (configuredOrigin) return configuredOrigin;

  return new URL(request.url).origin;
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

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim().toLowerCase() ?? '';
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}
