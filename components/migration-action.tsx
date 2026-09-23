'use client';

import { useState } from 'react';

export function MigrationAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function run() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/migration-003', { method: 'POST' });
      const result = (await response.json()) as {
        error?: string;
        before?: Record<string, number>;
        after?: Record<string, number>;
      };
      if (!response.ok) throw new Error(result.error ?? 'Migration failed.');
      setMessage(`Migration 003 complete. Existing row counts verified: ${JSON.stringify(result.after)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Migration failed.');
    } finally {
      setBusy(false);
    }
  }
  return <div className="space-y-3">
    <button disabled={busy} onClick={() => void run()}
      className="rounded bg-[#ed6435] px-4 py-2 text-sm text-white">
      {busy ? 'Applying migration…' : 'Apply migration 003'}
    </button>
    {message && <output className="block text-sm">{message}</output>}
  </div>;
}
