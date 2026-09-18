export type LegalExportReceipt = {
  exportId: string;
  archiveHash: string;
  filename: string;
};

export async function downloadLegalArchive(): Promise<LegalExportReceipt> {
  const response = await fetch('/api/legal-export', { method: 'POST' });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? 'The legal archive could not be created.');
  }

  const contentDisposition = response.headers.get('content-disposition') ?? '';
  const filename =
    contentDisposition.match(/filename="([^"]+)"/)?.[1] ??
    'engage-sign-legal-archive.zip';
  const exportId = response.headers.get('x-export-id') ?? 'unknown';
  const archiveHash = response.headers.get('x-archive-sha256') ?? 'unavailable';
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return { exportId, archiveHash, filename };
}
