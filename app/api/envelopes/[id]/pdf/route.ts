import { getStaffUser } from '@/lib/auth/session';
import { readCompletedDownload } from '@/lib/completed-download';
import { getClientIp, hashClientIp } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return completedFile(request, context, 'final_pdf', 'application/pdf', 'pdf');
}

export async function completedFile(
  request: Request,
  context: { params: Promise<{ id: string }> },
  kind: 'final_pdf' | 'audit_certificate',
  contentType: string,
  extension: string,
) {
  const actor = await getStaffUser();
  if (!actor)
    return Response.json({ error: 'Sign in is required.' }, { status: 401 });
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return Response.json({ error: 'Invalid document ID.' }, { status: 400 });
  try {
    const file = await readCompletedDownload({
      user: actor,
      envelopeId: id,
      kind,
      ipHash: hashClientIp(getClientIp(request)),
      userAgent: request.headers.get('user-agent'),
    });
    if (!file)
      return Response.json(
        { error: 'That completed file is not available.' },
        { status: 404 },
      );
    return new Response(Uint8Array.from(file.bytes).buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="engage-sign-${id}.${extension}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Document-SHA256': file.hash,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'The file could not be read.',
      },
      { status: 409 },
    );
  }
}
