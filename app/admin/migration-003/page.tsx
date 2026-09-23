import Link from 'next/link';

import { MigrationAction } from '@/components/migration-action';
import { requireAdmin } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function MigrationPage() {
  await requireAdmin('/admin/migration-003');
  return <main className="mx-auto max-w-2xl px-5 py-8 text-[#2c2028]">
    <Link href="/" className="text-sm underline">← Dashboard</Link>
    <h1 className="mt-4 text-3xl font-semibold">Database migration 003</h1>
    <p className="mt-3 text-sm">Add final archive storage and email retry columns. This operation preserves all existing users, templates, and audit events. It is safe to retry if interrupted.</p>
    <div className="mt-6"><MigrationAction /></div>
  </main>;
}
