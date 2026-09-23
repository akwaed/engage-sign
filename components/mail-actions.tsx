'use client';

import { useState } from 'react';

export function MailActions({ failedEnvelopeIds }: { failedEnvelopeIds: string[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function act(action: 'verify' | 'run' | 'retry', envelopeId?: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, envelopeId }),
      });
      if (!response.headers.get('content-type')?.includes('application/json'))
        throw new Error(`Mail service returned HTTP ${response.status} without a JSON response.`);
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? 'Mail operation failed.');
      if (action === 'verify') setMessage(result.message ?? 'SMTP is ready.');
      else window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Mail operation failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void act('verify')}
          className="rounded border px-4 py-2 text-sm">Test SMTP connection</button>
        <button disabled={busy} onClick={() => void act('run')}
          className="rounded bg-[#ed6435] px-4 py-2 text-sm text-white">Process due mail</button>
      </div>
      {failedEnvelopeIds.map((id) => (
        <button key={id} disabled={busy} onClick={() => void act('retry', id)}
          className="mr-2 rounded border px-3 py-1 text-sm">Retry failed mail for {id.slice(0, 8)}</button>
      ))}
      {message && <output className="block text-sm">{message}</output>}
    </div>
  );
}
