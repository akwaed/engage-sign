'use client';

import { useState } from 'react';
import {
  ArchiveIcon,
  CheckCircle2Icon,
  DownloadIcon,
  Loader2Icon,
  ShieldAlertIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  downloadLegalArchive,
  type LegalExportReceipt,
} from '@/lib/client-legal-export';

export function LegalExportButton({
  placement = 'toolbar',
}: {
  placement?: 'toolbar' | 'card';
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [receipt, setReceipt] = useState<LegalExportReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportArchive() {
    setIsExporting(true);
    setReceipt(null);
    setError(null);
    try {
      setReceipt(await downloadLegalArchive());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The legal archive could not be created.',
      );
    } finally {
      setIsExporting(false);
    }
  }

  const trigger =
    placement === 'card' ? (
      <Button
        variant="secondary"
        className="bg-white text-[#2c2028] hover:bg-white/90"
      />
    ) : (
      <Button variant="outline" size="lg" />
    );

  return (
    <Dialog>
      <DialogTrigger render={trigger}>
        <DownloadIcon data-icon="inline-start" />
        {placement === 'card' ? 'Export archive' : 'Legal export'}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-[#f5ece7] text-[#a04d31]">
            <ArchiveIcon className="size-5" />
          </div>
          <DialogTitle>Create a complete legal archive</DialogTitle>
          <DialogDescription>
            This downloads every available document version and its supporting
            evidence. Nothing is deleted or changed.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-[#faf9f7] p-4">
          <p className="text-sm font-medium">The ZIP package includes</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Signed PDFs, intermediate versions, and audit certificates</li>
            <li>
              Signer status, signature events, and the complete audit-event
              chain
            </li>
            <li>
              A manifest plus SHA-256 checksums for independent verification
            </li>
          </ul>
        </div>

        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p className="text-xs leading-5">
            The archive can contain sensitive personal data. Move it to
            encrypted offsite storage and restrict access after download.
          </p>
        </div>

        {receipt ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2Icon className="size-4" />
              Archive downloaded
            </div>
            <p className="mt-1 break-all font-mono text-[11px] leading-5 text-emerald-800">
              SHA-256: {receipt.archiveHash}
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          <Button
            onClick={exportArchive}
            disabled={isExporting}
            className="bg-[#ed6435] hover:bg-[#d9552a]"
          >
            {isExporting ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            {isExporting ? 'Building archive…' : 'Download complete archive'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
