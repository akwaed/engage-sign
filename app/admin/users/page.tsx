import { ArrowLeftIcon, ShieldCheckIcon } from 'lucide-react';
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
import { canManageUsers, roleLabel, type Role } from '@/lib/auth/rbac';
import { requireUser } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

type UserListRow = RowDataPacket & {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  can_publish: number;
  status: 'active' | 'disabled';
  created_at: string;
};
type ActivityRow = RowDataPacket & {
  event_type: string;
  occurred_at: string;
  actor_id: string | null;
};
type SessionRow = RowDataPacket & {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
};

const PAGE_SIZE = 25;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const currentUser = await requireUser('/admin/users', canManageUsers);
  const query = await searchParams;
  const q = first(query.q)?.trim().slice(0, 160) ?? '';
  const role = first(query.role) ?? '';
  const status = first(query.status) ?? '';
  const page = Math.max(1, Number(first(query.page) ?? '1') || 1);
  const selected = first(query.user);
  const like = `%${q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  const roleFilter =
    role === 'standard_user'
      ? "role IN ('staff', 'standard_user')"
      : role === 'admin' || role === 'template_manager'
        ? 'role = ?'
        : '1 = 1';
  const params: Array<string | number> = [];
  let where = 'WHERE 1 = 1';
  if (q) {
    where += ' AND (email LIKE ? OR display_name LIKE ?)';
    params.push(like, like);
  }
  if (role === 'admin' || role === 'template_manager') {
    where += ` AND ${roleFilter}`;
    params.push(role);
  } else if (role === 'standard_user') {
    where += ` AND ${roleFilter}`;
  }
  if (status === 'active' || status === 'disabled') {
    where += ' AND status = ?';
    params.push(status);
  }
  const [countRows] = await getMysqlPool().query<
    Array<RowDataPacket & { total: number }>
  >(`SELECT COUNT(*) AS total FROM users ${where}`, params);
  const total = Number(countRows[0]?.total ?? 0);
  const [users] = await getMysqlPool().query<UserListRow[]>(
    `SELECT id, email, display_name, role, can_publish, status, created_at
       FROM users ${where}
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  );
  const selectedUser = users.find((user) => user.id === selected) ?? null;
  let activityRows: ActivityRow[] = [];
  let sessionRows: SessionRow[] = [];
  if (selectedUser) {
    const [activity, sessions] = await Promise.all([
      getMysqlPool().query<ActivityRow[]>(
        `SELECT event_type, occurred_at, actor_id
           FROM audit_events
          WHERE actor_id = ?
             OR JSON_UNQUOTE(JSON_EXTRACT(details_json, '$.targetUserId')) = ?
          ORDER BY occurred_at DESC
          LIMIT 20`,
        [selectedUser.id, selectedUser.id],
      ),
      getMysqlPool().query<SessionRow[]>(
        `SELECT id, created_at, last_seen_at, expires_at
           FROM staff_sessions
          WHERE user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(6)
          ORDER BY created_at DESC`,
        [selectedUser.id],
      ),
    ]);
    activityRows = activity[0];
    sessionRows = sessions[0];
  }

  return (
    <main className="min-h-screen bg-[#f7f5f2] px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/"
          className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Back to dashboard
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#2c2028]">
              Accounts
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Invite people by email, assign roles, and revoke sessions. Signed
              in as {currentUser.email}.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm">
            <ShieldCheckIcon className="size-4 text-[#a04d31]" />
            <span>{total} accounts</span>
          </div>
        </div>
        {first(query.message) ? (
          <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {successMessage(first(query.message))}
          </p>
        ) : null}
        {first(query.error) ? (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {errorMessage(first(query.error))}
          </p>
        ) : null}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Find an account</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-4" method="get">
              <Input name="q" defaultValue={q} placeholder="Name or email" />
              <NativeSelect name="role" defaultValue={role}>
                <NativeSelectOption value="">All roles</NativeSelectOption>
                <NativeSelectOption value="admin">
                  Administrator
                </NativeSelectOption>
                <NativeSelectOption value="template_manager">
                  Template manager
                </NativeSelectOption>
                <NativeSelectOption value="standard_user">
                  Standard user
                </NativeSelectOption>
              </NativeSelect>
              <NativeSelect name="status" defaultValue={status}>
                <NativeSelectOption value="">Any status</NativeSelectOption>
                <NativeSelectOption value="active">Active</NativeSelectOption>
                <NativeSelectOption value="disabled">
                  Disabled
                </NativeSelectOption>
              </NativeSelect>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <Card>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-6 text-right"> </TableHead>
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
                        <Badge variant="outline">{roleLabel(user.role)}</Badge>
                        {user.role === 'template_manager' &&
                        Number(user.can_publish) === 1 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Can publish
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>{user.status}</TableCell>
                      <TableCell className="pr-6 text-right">
                        <Link
                          className="text-sm underline"
                          href={`/admin/users?${searchHref(query, { user: user.id })}`}
                        >
                          Activity
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between px-6 py-4 text-sm">
                <span>
                  Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <div className="flex gap-3">
                  {page > 1 ? (
                    <Link
                      className="underline"
                      href={`/admin/users?${searchHref(query, { page: String(page - 1) })}`}
                    >
                      Previous
                    </Link>
                  ) : null}
                  {page * PAGE_SIZE < total ? (
                    <Link
                      className="underline"
                      href={`/admin/users?${searchHref(query, { page: String(page + 1) })}`}
                    >
                      Next
                    </Link>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Invite a user</CardTitle>
                <CardDescription>
                  They receive an email link to set their own password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  action="/api/admin/users"
                  method="post"
                  className="space-y-4"
                >
                  <input type="hidden" name="action" value="invite" />
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
                      defaultValue="standard_user"
                    >
                      <NativeSelectOption value="standard_user">
                        Standard user
                      </NativeSelectOption>
                      <NativeSelectOption value="template_manager">
                        Template manager
                      </NativeSelectOption>
                      <NativeSelectOption value="admin">
                        Administrator
                      </NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input name="canPublish" type="checkbox" value="1" />
                    Can publish templates
                  </label>
                  <Button
                    type="submit"
                    className="w-full bg-[#ed6435] hover:bg-[#d9552a]"
                  >
                    Send invite
                  </Button>
                </form>
              </CardContent>
            </Card>
            {selectedUser ? (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedUser.display_name}</CardTitle>
                  <CardDescription>{selectedUser.email}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form
                    action="/api/admin/users"
                    method="post"
                    className="space-y-3"
                  >
                    <input type="hidden" name="action" value="set_role" />
                    <input
                      type="hidden"
                      name="userId"
                      value={selectedUser.id}
                    />
                    <NativeSelect
                      name="role"
                      defaultValue={
                        selectedUser.role === 'staff'
                          ? 'standard_user'
                          : selectedUser.role
                      }
                    >
                      <NativeSelectOption value="standard_user">
                        Standard user
                      </NativeSelectOption>
                      <NativeSelectOption value="template_manager">
                        Template manager
                      </NativeSelectOption>
                      <NativeSelectOption value="admin">
                        Administrator
                      </NativeSelectOption>
                    </NativeSelect>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        name="canPublish"
                        type="checkbox"
                        value="1"
                        defaultChecked={Number(selectedUser.can_publish) === 1}
                      />
                      Can publish templates
                    </label>
                    <Button type="submit" variant="outline" className="w-full">
                      Save role
                    </Button>
                  </form>
                  <div className="flex flex-wrap gap-2">
                    <form action="/api/admin/users" method="post">
                      <input
                        type="hidden"
                        name="action"
                        value={
                          selectedUser.status === 'active'
                            ? 'disable'
                            : 'enable'
                        }
                      />
                      <input
                        type="hidden"
                        name="userId"
                        value={selectedUser.id}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={selectedUser.id === currentUser.id}
                      >
                        {selectedUser.status === 'active'
                          ? 'Disable'
                          : 'Enable'}
                      </Button>
                    </form>
                    <form action="/api/admin/users" method="post">
                      <input type="hidden" name="action" value="send_reset" />
                      <input
                        type="hidden"
                        name="userId"
                        value={selectedUser.id}
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Email reset link
                      </Button>
                    </form>
                    <form action="/api/admin/users" method="post">
                      <input
                        type="hidden"
                        name="action"
                        value="revoke_sessions"
                      />
                      <input
                        type="hidden"
                        name="userId"
                        value={selectedUser.id}
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Revoke sessions
                      </Button>
                    </form>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Active sessions</p>
                    <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                      {sessionRows.map((session) => (
                        <li
                          key={session.id}
                          className="flex justify-between gap-2"
                        >
                          <span>
                            Seen {session.last_seen_at} · expires{' '}
                            {session.expires_at}
                          </span>
                          <form action="/api/admin/users" method="post">
                            <input
                              type="hidden"
                              name="action"
                              value="revoke_session"
                            />
                            <input
                              type="hidden"
                              name="userId"
                              value={selectedUser.id}
                            />
                            <input
                              type="hidden"
                              name="sessionId"
                              value={session.id}
                            />
                            <button className="underline" type="submit">
                              Revoke
                            </button>
                          </form>
                        </li>
                      ))}
                      {sessionRows.length === 0 ? <li>None</li> : null}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Recent activity</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {activityRows.map((event, index) => (
                        <li key={`${event.occurred_at}-${index}`}>
                          {event.occurred_at} · {event.event_type}
                        </li>
                      ))}
                      {activityRows.length === 0 ? <li>None</li> : null}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? null);
}

function searchHref(
  query: Record<string, string | string[] | undefined>,
  patch: Record<string, string>,
) {
  const next = new URLSearchParams();
  for (const key of ['q', 'role', 'status', 'user', 'page']) {
    const value = patch[key] ?? first(query[key]);
    if (value) next.set(key, value);
  }
  return next.toString();
}

function successMessage(code: string | null) {
  if (code === 'invited') return 'Invite email queued.';
  if (code === 'disabled') return 'Account disabled and sessions revoked.';
  if (code === 'enabled') return 'Account enabled.';
  if (code === 'role') return 'Role updated and sessions revoked.';
  if (code === 'reset') return 'Password reset email queued.';
  if (code === 'revoked') return 'Sessions revoked.';
  return 'Changes saved.';
}

function errorMessage(code: string | null) {
  if (code === 'last_admin')
    return 'The last active administrator cannot be removed.';
  if (code === 'self') return 'You cannot disable your own account.';
  if (code === 'duplicate') return 'That email address already has an account.';
  if (code === 'request') return 'The request origin could not be verified.';
  return 'The change could not be saved.';
}
