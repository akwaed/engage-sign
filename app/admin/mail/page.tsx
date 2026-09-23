import Link from 'next/link';
import type { RowDataPacket } from 'mysql2/promise';

import { MailActions } from '@/components/mail-actions';
import { requireAdmin } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

type Delivery = RowDataPacket & {
  id: string;
  envelope_id: string;
  signer_id: string;
  title: string;
  notification_type: string;
  status: string;
  attempts: number;
  created_at: string;
  sent_at: string | null;
  next_attempt_at: string | null;
  provider_response: string | null;
  last_error_code: string | null;
};

export default async function MailPage() {
  await requireAdmin('/admin/mail');
  const [rows] = await getMysqlPool().query<Delivery[]>(
    `SELECT o.id, s.envelope_id, o.signer_id, e.title, o.notification_type,
            o.status, o.attempts, o.created_at, o.sent_at, o.next_attempt_at,
            o.provider_response, o.last_error_code
     FROM notification_outbox o
     JOIN signers s ON s.id = o.signer_id
     JOIN envelopes e ON e.id = s.envelope_id
     ORDER BY (o.status = 'failed') DESC, o.created_at DESC LIMIT 100`,
  );
  const failedEnvelopeIds = [...new Set(rows
    .filter((row) => row.status === 'failed' && row.attempts >= 3)
    .map((row) => row.envelope_id))];
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 text-[#2c2028]">
      <Link href="/" className="text-sm underline">← Dashboard</Link>
      <h1 className="mt-4 text-3xl font-semibold">Email delivery</h1>
      <p className="mt-2 text-sm text-stone-600">Delivery records contain signer references and SMTP status. Private signing links are never shown here.</p>
      <div className="mt-5"><MailActions failedEnvelopeIds={failedEnvelopeIds} /></div>
      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50"><tr>
            <th className="p-3">Document / recipient</th>
            <th className="p-3">Message</th>
            <th className="p-3">Status</th>
            <th className="p-3">Attempts</th>
            <th className="p-3">Provider / error</th>
            <th className="p-3">Next attempt (UTC)</th>
          </tr></thead>
          <tbody>{rows.map((row) => (
            <tr key={row.id} className="border-t align-top">
              <td className="p-3"><Link className="underline" href={`/admin/documents/${row.envelope_id}`}>{row.title}</Link><br /><span className="text-xs text-stone-500">{row.signer_id}</span></td>
              <td className="p-3">{row.notification_type.replaceAll('_', ' ')}</td>
              <td className="p-3">{row.status}</td>
              <td className="p-3">{row.attempts}</td>
              <td className="max-w-52 break-words p-3">{row.provider_response ?? row.last_error_code ?? '—'}</td>
              <td className="p-3">{row.next_attempt_at ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {rows.length === 0 && <p className="p-5 text-sm text-stone-600">No messages have been queued.</p>}
      </div>
    </main>
  );
}
