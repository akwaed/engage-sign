import type { RowDataPacket } from 'mysql2/promise';

import { getMysqlPool } from '@/lib/mysql';
import { readPrivateObject } from '@/lib/private-storage';
import { getRecipientSession } from '@/lib/recipient-session';
import { sha256 } from '@/lib/template-files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getRecipientSession();
  if (!session)
    return new Response('Signing session unavailable.', { status: 403 });
  const [rows] = await getMysqlPool().query<
    Array<
      RowDataPacket & {
        storage_key: string;
        document_hash: string;
      }
    >
  >('SELECT storage_key, document_hash FROM document_versions WHERE id = ?', [
    session.presented_document_id,
  ]);
  const document = rows[0];
  if (!document) return new Response('Document unavailable.', { status: 404 });
  const bytes = await readPrivateObject(document.storage_key);
  if (sha256(bytes) !== document.document_hash)
    return new Response('Document integrity check failed.', { status: 500 });
  return new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="document-to-review.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
