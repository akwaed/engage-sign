import { createHash } from 'node:crypto';

export function rateWindowStart(nowMs: number, windowSeconds: number) {
  const size = windowSeconds * 1000;
  return new Date(Math.floor(nowMs / size) * size);
}

export function rateAllowed(attempts: number, limit: number) {
  return attempts <= limit;
}

export function rateSubjectHash(bucket: string, value: string) {
  return createHash('sha256')
    .update(`${bucket}\0${process.env.IP_HASH_SECRET ?? ''}\0${value}`)
    .digest('hex');
}

export const RATE_LIMITS = {
  loginIp: { bucket: 'login_ip', limit: 60, windowSeconds: 15 * 60 },
  forgotEmail: { bucket: 'forgot_email', limit: 5, windowSeconds: 60 * 60 },
  forgotIp: { bucket: 'forgot_ip', limit: 20, windowSeconds: 60 * 60 },
  resetIp: { bucket: 'reset_ip', limit: 20, windowSeconds: 60 * 60 },
  resetToken: { bucket: 'reset_token', limit: 5, windowSeconds: 60 * 60 },
  setupIp: { bucket: 'setup_ip', limit: 10, windowSeconds: 60 * 60 },
} as const;
