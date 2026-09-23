import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { RowDataPacket } from 'mysql2/promise';

import { DocumentActions } from '@/components/document-actions';
import { requireAdmin } from '@/lib/auth/session';
import { decryptValue } from '@/lib/encryption';
import { getMysqlPool } from '@/lib/mysql';
import { expireDueEnvelopes } from '@/lib/envelope-expiration';

export const dynamic = 'force-dynamic';

type Envelope = RowDataPacket & {
  id: string;
  title: string;
  status: string;
  template_name: string;
  version_number: number;
  expires_at: string;
  routing_mode: string;
  locked_at: string | null;
};
type Signer = RowDataPacket & {
  id: string;
  signer_role: string;
  name_encrypted: string;
  email_encrypted: string;
  status: string;
  routing_order: number;
  is_required: number;
  notified_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  notification_status: string | null;
};

export default async function DocumentStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin('/admin/documents');
  await expireDueEnvelopes();
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const [[envelopes], [signers]] = await Promise.all([
    getMysqlPool().query<Envelope[]>(
      `SELECT e.id, e.title, e.status, e.expires_at, e.routing_mode, e.locked_at,
              t.name AS template_name, v.version_number
       FROM envelopes e JOIN template_versions v ON v.id = e.template_version_id
       JOIN templates t ON t.id = v.template_id WHERE e.id = ?`,
      [id],
    ),
    getMysqlPool().query<Signer[]>(
      `SELECT s.id, s.signer_role, s.name_encrypted, s.email_encrypted, s.status,
              s.routing_order, s.is_required, s.notified_at, s.viewed_at, s.signed_at,
              o.status AS notification_status
       FROM signers s LEFT JOIN notification_outbox o
         ON o.signer_id = s.id AND o.notification_type IN ('invite', 'next_signer')
       WHERE s.envelope_id = ? ORDER BY s.routing_order, s.id`,
      [id],
    ),
  ]);
  const envelope = envelopes[0];
  if (!envelope) notFound();
  return (
    <main className="mx-auto max-w-4xl px-5 py-8 text-[#2c2028]">
      <Link href="/" className="text-sm underline">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">{envelope.title}</h1>
      <p className="mt-2 text-sm text-stone-600">
        {envelope.template_name} · v{envelope.version_number}
      </p>
      <div className="mt-6 grid gap-3 rounded-xl border bg-white p-5 text-sm sm:grid-cols-3">
        <div>
          <span className="text-stone-500">Status</span>
          <p className="mt-1 font-semibold">
            {envelope.status.replaceAll('_', ' ')}
          </p>
        </div>
        <div>
          <span className="text-stone-500">Routing</span>
          <p className="mt-1 font-semibold">{envelope.routing_mode}</p>
        </div>
        <div>
          <span className="text-stone-500">Expires (UTC)</span>
          <p className="mt-1 font-semibold">{envelope.expires_at}</p>
        </div>
      </div>
      <DocumentActions id={id} status={envelope.status} />
      <section className="mt-7 rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">Signer progress</h2>
        <div className="mt-4 space-y-3">
          {signers.map((signer) => (
            <div key={signer.id} className="rounded-lg border p-4 text-sm">
              <p className="font-medium">
                {decryptValue(
                  signer.name_encrypted,
                  `signer:${signer.id}:name`,
                )}{' '}
                · {signer.signer_role.replaceAll('_', ' ')}
              </p>
              <p className="mt-1 text-stone-600">
                {decryptValue(
                  signer.email_encrypted,
                  `signer:${signer.id}:email`,
                )}
              </p>
              <p className="mt-2">
                {signer.is_required ? 'Required' : 'Optional'} · order{' '}
                {signer.routing_order} · {signer.status}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                Invitation:{' '}
                {signer.notification_status ??
                  'waiting for prior required signer'}
                {signer.notified_at ? ` · sent ${signer.notified_at} UTC` : ''}
                {signer.viewed_at ? ` · viewed ${signer.viewed_at} UTC` : ''}
                {signer.signed_at ? ` · signed ${signer.signed_at} UTC` : ''}
              </p>
            </div>
          ))}
        </div>
      </section>
      {envelope.locked_at && (
        <p className="mt-5 text-xs text-stone-600">
          Document version and assigned fields locked at {envelope.locked_at}{' '}
          UTC.
        </p>
      )}
    </main>
  );
}
