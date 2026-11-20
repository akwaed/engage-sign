import { createHash, createHmac } from 'node:crypto';

export type AuditHashAlg = 'sha256' | 'hmac-sha256';

export type AuditCanonicalInput = {
  id: string;
  envelopeId: string | null;
  actorType: string;
  actorId: string | null;
  eventType: string;
  detailsJson: string;
  userAgent: string | null;
  occurredAt: string;
  previousHash: string | null;
};

export function canonicalAuditPayload(input: AuditCanonicalInput) {
  return JSON.stringify({
    id: input.id,
    envelopeId: input.envelopeId,
    actorType: input.actorType,
    actorId: input.actorId,
    eventType: input.eventType,
    detailsJson: input.detailsJson,
    userAgent: input.userAgent,
    occurredAt: input.occurredAt,
    previousHash: input.previousHash,
  });
}

export function auditKey(value = process.env.AUDIT_HMAC_KEY) {
  const key = value?.trim();
  return key ? key : null;
}

export function hashAuditPayload(
  payload: string,
  alg: AuditHashAlg,
  key = auditKey(),
) {
  if (alg === 'hmac-sha256') {
    if (!key)
      throw new Error('AUDIT_HMAC_KEY is required for HMAC audit events.');
    return createHmac('sha256', key).update(payload).digest('hex');
  }
  return createHash('sha256').update(payload).digest('hex');
}

export type AuditChainRow = {
  id: string;
  eventHash: string;
  previousHash: string | null;
  hashAlg: AuditHashAlg;
  canonicalPayload: string | null;
};

export function verifyAuditChain(rows: AuditChainRow[], key = auditKey()) {
  let previous: string | null = null;
  for (const [index, row] of rows.entries()) {
    if ((row.previousHash ?? null) !== previous)
      return {
        ok: false as const,
        checked: index,
        brokenAt: row.id,
        reason: 'chain',
      };
    if (row.canonicalPayload) {
      const alg = row.hashAlg === 'hmac-sha256' ? 'hmac-sha256' : 'sha256';
      if (alg === 'hmac-sha256' && !key)
        return {
          ok: false as const,
          checked: index,
          brokenAt: row.id,
          reason: 'missing-key',
        };
      if (hashAuditPayload(row.canonicalPayload, alg, key) !== row.eventHash)
        return {
          ok: false as const,
          checked: index,
          brokenAt: row.id,
          reason: 'hash',
        };
    }
    previous = row.eventHash;
  }
  return {
    ok: true as const,
    checked: rows.length,
    brokenAt: null,
    reason: null,
  };
}
