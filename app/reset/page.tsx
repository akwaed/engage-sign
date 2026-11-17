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

export const dynamic = 'force-dynamic';

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const token = first(query.token) ?? '';
  const error = first(query.error);
  const usable = /^[A-Za-z0-9_-]{43}$/.test(token);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f5f2] px-5 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-[#ed6435] text-white">
            <FileSignatureIcon className="size-5" />
          </div>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Use at least 14 characters. This link works once and expires in 30
            minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              This reset link is invalid or expired.
            </p>
          ) : null}
          {usable ? (
            <form action="/api/auth/reset" method="post" className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  minLength={14}
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button
                type="submit"
                className="h-10 w-full bg-[#ed6435] hover:bg-[#d9552a]"
              >
                Update password
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open the link from your email, or request a new one.
            </p>
          )}
          <p className="mt-4 text-sm">
            <Link className="underline" href="/forgot">
              Request a new link
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
