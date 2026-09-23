import { createHash, randomBytes } from 'node:crypto';

export type SignerState = {
  id: string;
  routingOrder: number;
  required: boolean;
  status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined' | 'expired';
};

export function createSigningToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSigningToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function nextEligibleSigners(signers: SignerState[]) {
  const incompleteRequired = signers
    .filter(
      (signer) =>
        signer.required &&
        !['signed', 'declined', 'expired'].includes(signer.status),
    )
    .map((signer) => signer.routingOrder);
  const nextOrder = Math.min(...incompleteRequired);
  if (!Number.isFinite(nextOrder)) return [];
  return signers.filter(
    (signer) =>
      signer.routingOrder === nextOrder && signer.status === 'pending',
  );
}

export function envelopeStatus(signers: SignerState[], current: string) {
  if (current === 'voided' || current === 'expired') return current;
  if (signers.some((signer) => signer.required && signer.status === 'declined'))
    return 'declined';
  if (
    signers
      .filter((signer) => signer.required)
      .every((signer) => signer.status === 'signed')
  )
    return 'completed';
  if (signers.some((signer) => signer.status === 'signed'))
    return 'partially_signed';
  if (signers.some((signer) => signer.status === 'viewed')) return 'viewed';
  return 'sent';
}

export function validateReminderDays(days: unknown): number[] {
  if (
    !Array.isArray(days) ||
    days.length > 10 ||
    !days.every((day) => Number.isInteger(day) && day >= 1 && day <= 365)
  )
    throw new Error('Reminder days must be 1–365, with at most ten entries.');
  return [...new Set(days)].sort((a, b) => b - a);
}

export function fromMysqlUtc(value: string | Date) {
  if (value instanceof Date) return value;
  return new Date(
    value.replace(' ', 'T').replace(/(?:Z|[+-]\d\d:\d\d)$/, '') + 'Z',
  );
}
