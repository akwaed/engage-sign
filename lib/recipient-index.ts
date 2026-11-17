import { createHmac } from 'node:crypto';

export function normalizeRecipientEmail(email: string) {
  return email.trim().toLowerCase();
}

export function recipientEmailIndex(email: string, secret: string) {
  if (!secret) throw new Error('A lookup secret is required.');
  return createHmac('sha256', secret)
    .update(normalizeRecipientEmail(email))
    .digest('hex');
}

export function classifyDocumentSearch(query: string) {
  const value = query.trim();
  if (!value)
    return { email: null as string | null, text: null as string | null };
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320)
    return { email: normalizeRecipientEmail(value), text: null };
  return { email: null, text: value.slice(0, 160) };
}
