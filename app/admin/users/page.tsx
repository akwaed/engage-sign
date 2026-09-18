import {
  ArrowLeftIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { RowDataPacket } from 'mysql2/promise';

import { Badge } from '@/components/ui/badge';
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
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireAdmin } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

type UserListRow = RowDataPacket & {
  id: string;
  email: string;
  display_name: string;
  role: 'admin' | 'staff';
  status: 'active' | 'disabled';
  created_at: string;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await requireAdmin('/admin/users');
  const query = await searchParams;
  const [users] = await getMysqlPool().query<UserListRow[]>(
    'SELECT id, email, display_name, role, status, created_at FROM users ORDER BY created_at ASC',
  );
  const message = first(query.message);
  const error = first(query.error);

  return (
    <main className="min-h-screen bg-[#f7f5f2] px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" />
              Back to dashboard
            </Link>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#2c2028]">
              Staff users
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create staff accounts, disable access, and issue
              administrator-managed password resets.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm">
            <ShieldCheckIcon className="size-4 text-[#a04d31]" />
            <span>Signed in as {currentUser.email}</span>
          </div>
        </div>

        {message ? (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {successMessage(message)}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {errorMessage(error)}
          </p>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="size-5" />
                Current users
              </CardTitle>
              <CardDescription>
                Role and status are enforced on the server for every protected
                action.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="pl-6">
                        <p className="font-medium">{user.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            user.status === 'active'
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-stone-100 text-stone-700'
                          }
                        >
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6">
                        <div className="flex justify-end gap-2">
                          <form action="/api/admin/users" method="post">
                            <input
                              type="hidden"
                              name="action"
                              value={
                                user.status === 'active' ? 'disable' : 'enable'
                              }
                            />
                            <input
                              type="hidden"
                              name="userId"
                              value={user.id}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="outline"
                              disabled={user.id === currentUser.id}
                            >
                              {user.status === 'active' ? 'Disable' : 'Enable'}
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlusIcon className="size-5" />
                  Add a user
                </CardTitle>
                <CardDescription>
                  Only administrators can create accounts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  action="/api/admin/users"
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="action" value="create" />
                  <div className="space-y-2">
                    <Label htmlFor="new-name">Full name</Label>
                    <Input id="new-name" name="displayName" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-email">Email</Label>
                    <Input id="new-email" name="email" type="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-role">Role</Label>
                    <NativeSelect
                      id="new-role"
                      name="role"
                      defaultValue="staff"
                    >
                      <NativeSelectOption value="staff">
                        Staff
                      </NativeSelectOption>
                      <NativeSelectOption value="admin">
                        Administrator
                      </NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Temporary password</Label>
                    <Input
                      id="new-password"
                      name="password"
                      type="password"
                      minLength={14}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      At least 14 characters. Share it through a secure channel.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[#ed6435] hover:bg-[#d9552a]"
                  >
                    Create user
                  </Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Reset a password</CardTitle>
                <CardDescription>
                  Sets a new temporary password and signs the user out
                  everywhere.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  action="/api/admin/users"
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="action" value="reset_password" />
                  <div className="space-y-2">
                    <Label htmlFor="reset-user">User</Label>
                    <NativeSelect id="reset-user" name="userId" required>
                      <NativeSelectOption value="">
                        Select a user
                      </NativeSelectOption>
                      {users.map((user) => (
                        <NativeSelectOption key={user.id} value={user.id}>
                          {user.display_name} — {user.email}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reset-password">
                      New temporary password
                    </Label>
                    <Input
                      id="reset-password"
                      name="password"
                      type="password"
                      minLength={14}
                      required
                    />
                  </div>
                  <Button type="submit" variant="outline" className="w-full">
                    Reset password
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? null);
}
function successMessage(code: string) {
  return code === 'created'
    ? 'User created.'
    : code === 'disabled'
      ? 'User disabled and active sessions revoked.'
      : code === 'enabled'
        ? 'User enabled.'
        : code === 'password'
          ? 'Password reset and active sessions revoked.'
          : 'Changes saved.';
}
function errorMessage(code: string) {
  return code === 'last_admin'
    ? 'The last active administrator cannot be disabled.'
    : code === 'self'
      ? 'You cannot disable your own account.'
      : code === 'password'
        ? 'Use a password with at least 14 characters.'
        : code === 'duplicate'
          ? 'That email address already has an account.'
          : code === 'request'
            ? 'The request origin could not be verified.'
            : 'The change could not be saved.';
}
