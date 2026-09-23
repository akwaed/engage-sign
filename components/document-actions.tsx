'use client';

import { useState } from 'react';
import Link from 'next/link';

export function DocumentActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function act(action: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/envelopes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Action failed.');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-2">
        {status === 'draft' && (
          <button
            disabled={busy}
            onClick={() => void act('send')}
            className="rounded bg-[#ed6435] px-4 py-2 text-sm text-white"
          >
            Send invitations
          </button>
        )}
        {status === 'draft' && (
          <Link
            href={`/admin/send?draft=${id}`}
            className="rounded border px-4 py-2 text-sm"
          >
            Edit draft
          </Link>
        )}
        {['sent', 'viewed', 'partially_signed'].includes(status) && (
          <>
            <button
              disabled={busy}
              onClick={() => void act('retry_notifications')}
              className="rounded border px-4 py-2 text-sm"
            >
              Retry failed invitations
            </button>
            <button
              disabled={busy}
              onClick={() => void act('void')}
              className="rounded border px-4 py-2 text-sm text-red-700"
            >
              Void document
            </button>
          </>
        )}
      </div>
      {message && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {message}
        </p>
      )}
    </div>
  );
}
