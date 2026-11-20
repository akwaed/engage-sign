import { completedFile } from '@/lib/completed-file';

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
