'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PdfTemplateUpload() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    form.set('action', 'create_pdf');
    try {
      const response = await fetch('/api/admin/templates', {
        method: 'POST',
        body: form,
      });
      const body = (await response.json()) as {
        error?: string;
        versionId?: string;
      };
      if (!response.ok || !body.versionId)
        throw new Error(body.error ?? 'Upload failed.');
      router.push(`/admin/templates/${body.versionId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mb-6 rounded-xl border bg-white p-5"
    >
      <h2 className="text-lg font-semibold text-[#2c2028]">Start from a PDF</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload the blank form. You will place the fields on the pages. Signers
        cannot move those fields later.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <div className="space-y-1">
          <Label htmlFor="template-name">Template name</Label>
          <Input
            id="template-name"
            name="name"
            required
            placeholder="TB risk assessment"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="template-roles">Recipient roles</Label>
          <Input
            id="template-roles"
            name="roles"
            defaultValue="signer"
            placeholder="signer, witness"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="template-file">PDF file</Label>
          <Input
            id="template-file"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            required
          />
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="bg-[#ed6435] hover:bg-[#d9552a]"
        >
          {busy ? 'Checking PDF…' : 'Upload and place fields'}
        </Button>
      </div>
      {message ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {message}
        </p>
      ) : null}
    </form>
  );
}
