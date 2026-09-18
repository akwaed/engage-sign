import { getMysqlPool } from '@/lib/mysql';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  let database = 'unavailable';
  try {
    await getMysqlPool().query('SELECT 1');
    database = 'connected';
  } catch {
    database = 'unavailable';
  }
  return Response.json(
    { status: 'running', database },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
