import type { RowDataPacket } from 'mysql2/promise';

import { verifyAuditChain, type AuditHashAlg } from '@/lib/audit-chain';
import { canManageUsers } from '@/lib/auth/rbac';
import { getStaffUser } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const actor = await getStaffUser();
  if (!actor || !canManageUsers(actor))
    return Response.json(
      { error: 'Administrator access is required.' },
      { status: 403 },
    );
  const [rows] = await getMysqlPool().query<
    Array<
      RowDataPacket & {
        id: string;
        event_hash: string;
        previous_hash: string | null;
        hash_alg: AuditHashAlg;
        canonical_payload: string | null;
      }
    >
  >(
    `SELECT id, event_hash, previous_hash, hash_alg, canonical_payload
       FROM audit_events ORDER BY occurred_at, id`,
  );
  const result = verifyAuditChain(
    rows.map((row) => ({
      id: row.id,
      eventHash: row.event_hash,
      previousHash: row.previous_hash,
      hashAlg: row.hash_alg === 'hmac-sha256' ? 'hmac-sha256' : 'sha256',
      canonicalPayload: row.canonical_payload,
    })),
  );
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
