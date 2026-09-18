import { FileSignatureIcon, ShieldCheckIcon } from 'lucide-react';
import { redirect } from 'next/navigation';

import { getStaffUser, safeReturnTo } from '@/lib/auth/session';
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

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  let existingUser = null;
  try {
    existingUser = await getStaffUser();
  } catch {
    redirect('/setup?error=database');
  }
  if (existingUser) redirect(safeReturnTo(first(query.return_to)));
  const error = loginError(first(query.error));
  const returnTo = safeReturnTo(first(query.return_to));

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#ed6435] text-white">
            <FileSignatureIcon className="size-5" />
          </div>
          <div>
            <p className="font-semibold text-[#2c2028]">Engage Sign</p>
            <p className="text-xs text-muted-foreground">Secure staff access</p>
          </div>
        </div>

        <Card className="shadow-[0_20px_60px_rgb(51_35_44/10%)]">
          <CardHeader>
            <CardTitle>Staff sign in</CardTitle>
            <CardDescription>
              Use the account created by an Engage Sign administrator.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {error}
              </p>
            ) : null}
            {first(query.setup) === 'complete' ? (
              <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                Administrator created. Sign in to continue.
              </p>
            ) : null}
            <form action="/api/auth/login" method="post" className="space-y-4">
              <input type="hidden" name="returnTo" value={returnTo} />
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
                  autoComplete="current-password"
                  required
                  className="h-10"
                />
              </div>
              <Button
                type="submit"
                className="h-10 w-full bg-[#ed6435] hover:bg-[#d9552a]"
              >
                Sign in
              </Button>
            </form>
            <div className="mt-5 flex gap-2 rounded-lg bg-[#faf9f7] p-3 text-xs leading-5 text-muted-foreground">
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-[#a04d31]" />
              Sessions expire after 12 hours. Five failed attempts temporarily
              lock the account.
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? null);
}

function loginError(code: string | null) {
  if (code === 'invalid') return 'The email or password was not accepted.';
  if (code === 'locked')
    return 'This account is temporarily locked. Try again in 15 minutes.';
  if (code === 'disabled')
    return 'This account has been disabled. Contact an administrator.';
  if (code === 'request')
    return 'The sign-in request could not be verified. Please try again.';
  return null;
}
