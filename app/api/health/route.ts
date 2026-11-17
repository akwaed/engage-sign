import { access, constants } from 'node:fs/promises';
import { getMysqlPool } from '@/lib/mysql';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET() {
  let database = 'unavailable';
  let storage = 'unavailable';
  try {
    await getMysqlPool().query('SELECT 1');
    database = 'connected';
  } catch {}
  try {
    await access(
      process.env.PRIVATE_STORAGE_PATH ?? '',
      constants.R_OK | constants.W_OK,
    );
    storage = 'ready';
  } catch {}
  const ready = database === 'connected' && storage === 'ready';
  return Response.json(
    { status: ready ? 'ready' : 'unavailable', database, storage },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
