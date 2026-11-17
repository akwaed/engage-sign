import { createHash, timingSafeEqual } from 'node:crypto';

export type SetupDecision = 'ok' | 'closed' | 'token';

export function setupAllowed(input: {
  setupCompleted: boolean;
  userCount: number;
  suppliedToken: string;
  expectedToken: string;
}): SetupDecision {
  if (input.setupCompleted || input.userCount > 0) return 'closed';
  if (!tokensMatch(input.suppliedToken, input.expectedToken)) return 'token';
  return 'ok';
}

export function tokensMatch(left: string, right: string) {
  if (!left || !right) return false;
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
