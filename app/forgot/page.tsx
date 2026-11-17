import { FileSignatureIcon } from 'lucide-react';
import Link from 'next/link';

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
import { FORGOT_MESSAGE } from '@/lib/auth/reset-token';

export const dynamic = 'force-dynamic';

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const sent = first(query.sent) === '1';
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] px-5 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-[#ed6435] text-white">
            <FileSignatureIcon className="size-5" />
          </div>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            We will email a link if the address has an active account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {FORGOT_MESSAGE}
            </p>
          ) : (
            <form action="/api/auth/forgot" method="post" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <Button
                type="submit"
                className="h-10 w-full bg-[#ed6435] hover:bg-[#d9552a]"
              >
                Email reset link
              </Button>
            </form>
          )}
          <p className="mt-4 text-sm">
            <Link className="underline" href="/login">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? null);
}
