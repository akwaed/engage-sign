import { completedFile } from '@/lib/completed-file';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return completedFile(request, context, 'final_pdf', 'application/pdf', 'pdf');
}
