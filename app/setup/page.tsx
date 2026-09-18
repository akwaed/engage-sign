import { DatabaseIcon, FileSignatureIcon, KeyRoundIcon } from 'lucide-react';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2/promise';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMysqlPool } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let configured = true;
  let userCount = 0;
  try {
    const [rows] = await getMysqlPool().query<
      Array<RowDataPacket & { total: number }>
    >('SELECT COUNT(*) AS total FROM users');
    userCount = Number(rows[0]?.total ?? 0);
  } catch {
    configured = false;
  }
  if (configured && userCount > 0) redirect('/login');

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] px-5 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#ed6435] text-white">
            <FileSignatureIcon className="size-5" />
          </div>
          <div>
            <p className="font-semibold text-[#2c2028]">Engage Sign</p>
            <p className="text-xs text-muted-foreground">
              One-time administrator setup
            </p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Create the first administrator</CardTitle>
            <CardDescription>
              This page closes permanently after the first user is created. It
              requires the private SETUP_TOKEN from GoDaddy Secrets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!configured ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="flex items-center gap-2 font-medium">
                  <DatabaseIcon className="size-4" />
                  Database setup is required
                </div>
                <p className="mt-2 leading-6">
                  Create the hosted MySQL database, import{' '}
                  <code>database/mysql/schema.sql</code>, and add its connection
                  values as GoDaddy secrets. Then reload this page.
                </p>
              </div>
            ) : (
              <form action="/api/setup" method="post" className="space-y-4">
                {first(query.error) ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                  >
                    {setupError(first(query.error))}
                  </p>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="displayName">Full name</Label>
                  <Input
                    id="displayName"
                    name="displayName"
                    autoComplete="name"
                    required
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    minLength={14}
                    autoComplete="new-password"
                    required
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    At least 14 characters. A password manager is recommended.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setupToken">One-time setup secret</Label>
                  <Input
                    id="setupToken"
                    name="setupToken"
                    type="password"
                    autoComplete="off"
                    required
                    className="h-10"
                  />
                </div>
                <Button
                  type="submit"
                  className="h-10 w-full bg-[#ed6435] hover:bg-[#d9552a]"
                >
                  <KeyRoundIcon data-icon="inline-start" />
                  Create administrator
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? null);
}
function setupError(code: string | null) {
  if (code === 'token') return 'The one-time setup secret was not accepted.';
  if (code === 'password') return 'Use a password with at least 14 characters.';
  if (code === 'exists')
    return 'An administrator already exists. Use the normal sign-in page.';
  if (code === 'request')
    return 'The setup request could not be verified. Please try again.';
  return 'Administrator setup could not be completed.';
}
