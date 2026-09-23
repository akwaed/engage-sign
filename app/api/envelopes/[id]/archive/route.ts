import { getStaffUser } from '@/lib/auth/session';
import { readVerifiedFinalArchive } from '@/lib/finalization';
import { assertSameOrigin } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
  } catch {
    return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
  }
  const actor = await getStaffUser();
  if (!actor || actor.role !== 'admin')
    return Response.json({ error: 'Administrator access is required.' }, { status: 403 });
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return Response.json({ error: 'Invalid document ID.' }, { status: 400 });
  try {
    const archive = await readVerifiedFinalArchive(id);
    return new Response(Uint8Array.from(archive.bytes).buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="engage-sign-final-${id}.zip"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Archive-SHA256': archive.hash,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Final archive unavailable.' },
      { status: 409 },
    );
  }
}
