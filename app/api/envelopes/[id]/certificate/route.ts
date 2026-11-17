import { completedFile } from '@/app/api/envelopes/[id]/pdf/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return completedFile(
    request,
    context,
    'audit_certificate',
    'application/pdf',
    'certificate.pdf',
  );
}
