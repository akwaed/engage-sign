import type { RowDataPacket } from 'mysql2/promise';

import { canManageUsers } from '@/lib/auth/rbac';
import { requireUser } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

export default async function RetentionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireUser('/admin/settings', canManageUsers);
  const query = await searchParams;
  const [rows] = await getMysqlPool().query<
    Array<
      RowDataPacket & {
        retention_days: number | null;
        retention_purge_enabled: number;
      }
    >
  >(
    'SELECT retention_days, retention_purge_enabled FROM system_settings WHERE id = ? LIMIT 1',
    ['global'],
  );
  const settings = rows[0];
  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <h1 className="text-2xl font-semibold">Retention</h1>
      <p className="mt-3 text-sm">
        Saving a number records how long completed documents are meant to be
        kept. Automatic deletion stays off. Nothing in this app deletes audit
        events or files on a schedule.
      </p>
      {query.saved && (
        <p className="mt-4 text-sm text-green-800">Saved. Purge remains off.</p>
      )}
      {query.error === 'days' && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Enter a whole number of days, or leave the field blank.
        </p>
      )}
      <form
        method="post"
        action="/api/admin/settings"
        className="mt-6 space-y-4"
      >
        <label className="block text-sm">
          Retention days
          <input
            name="retentionDays"
            inputMode="numeric"
            defaultValue={settings?.retention_days ?? ''}
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </label>
        <p className="text-sm">
          Purge enabled:{' '}
          {Number(settings?.retention_purge_enabled) === 1 ? 'yes' : 'no'}
        </p>
        <button
          className="rounded bg-[#ed6435] px-4 py-2 font-medium text-white"
          type="submit"
        >
          Save retention
        </button>
      </form>
    </main>
  );
}
