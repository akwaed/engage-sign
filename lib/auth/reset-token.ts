import { createHash, randomBytes } from 'node:crypto';

export const RESET_TTL_MS = 30 * 60 * 1000;

export function createResetToken() {
  return randomBytes(32).toString('base64url');
}

export function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function resetExpiry(now = Date.now()) {
  return new Date(now + RESET_TTL_MS);
}

export function resetTokenUsable(input: {
  usedAt: Date | null;
  expiresAt: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return input.usedAt === null && input.expiresAt.getTime() > now.getTime();
}

export const FORGOT_MESSAGE =
  'If an account exists for that email, a reset link is on its way. The link expires in 30 minutes.';
