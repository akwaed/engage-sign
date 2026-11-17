import {
  FileSignatureIcon,
  FilesIcon,
  LayoutDashboardIcon,
  MailIcon,
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
import {
  canAdministerMail,
  canEditTemplates,
  canManageUsers,
  canReadAllDocuments,
  canSendDocuments,
} from '@/lib/auth/rbac';
import { requireUser } from '@/lib/auth/session';
import { listDocuments } from '@/lib/document-list';
import { DASHBOARD_STATUSES } from '@/lib/document-status';
import { getMysqlPool } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

type Option = RowDataPacket & { id: string; label: string };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser('/documents', canSendDocuments);
  const query = await searchParams;
  const filters = {
    q: first(query.q) ?? '',
    status: first(query.status) ?? '',
    from: first(query.from) ?? '',
    to: first(query.to) ?? '',
    employeeId: first(query.employee) ?? '',
    templateId: first(query.template) ?? '',
    sort: first(query.sort) ?? 'sent',
    direction: first(query.direction) ?? 'desc',
    page: Number(first(query.page) ?? '1') || 1,
  };
  const admin = canReadAllDocuments(user);
  const [result, employees, templates] = await Promise.all([
    listDocuments(user, filters),
    admin
      ? getMysqlPool().query<Option[]>(
          `SELECT id, display_name AS label FROM users ORDER BY display_name`,
        )
      : Promise.resolve([[], undefined] as const),
    admin
      ? getMysqlPool().query<Option[]>(
          `SELECT id, name AS label FROM templates ORDER BY name`,
        )
      : Promise.resolve([[], undefined] as const),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const href = (patch: Record<string, string>) =>
    `/documents?${searchHref(query, patch)}`;

  return (
    <main className="min-h-screen bg-[#f7f5f2] text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-[#241820] px-5 py-6 text-white lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#ed6435]">
              <FileSignatureIcon className="size-5" />
            </div>
            <div>
              <p className="text-[15px] font-semibold">Engage Sign</p>
              <p className="mt-0.5 text-xs text-white/55">Secure agreements</p>
            </div>
          </div>
          <nav aria-label="Primary" className="mt-10 space-y-1">
            <NavLink href="/" icon={LayoutDashboardIcon} label="Overview" />
            <NavLink
              href="/documents"
              icon={FileSignatureIcon}
              label="Documents"
              active
            />
            {canEditTemplates(user) ? (
              <NavLink
                href="/admin/templates"
                icon={FilesIcon}
                label="Templates"
              />
            ) : null}
            {canAdministerMail(user) ? (
              <NavLink
                href="/admin/mail"
                icon={MailIcon}
                label="Email delivery"
              />
            ) : null}
            {canManageUsers(user) ? (
              <NavLink href="/admin/users" icon={UsersIcon} label="Users" />
            ) : null}
          </nav>
        </aside>
        <section className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[#2c2028]">
                {admin ? 'All documents' : 'Your documents'}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {result.total} document{result.total === 1 ? '' : 's'}
                {admin ? ' across the organization' : ' you sent'}.
              </p>
            </div>
            {canSendDocuments(user) ? (
              <Button
                className="bg-[#ed6435] hover:bg-[#d9552a]"
                render={<Link href="/admin/send" />}
              >
                Send document
              </Button>
            ) : null}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Find documents</CardTitle>
              <CardDescription>
                Search titles, or enter a full recipient email for an exact
                match. Email addresses are not searched as text.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-4" method="get">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="q">Search</Label>
                  <Input
                    id="q"
                    name="q"
                    defaultValue={filters.q}
                    placeholder="Document title or recipient@example.test"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="status">Status</Label>
                  <NativeSelect
                    id="status"
                    name="status"
                    defaultValue={filters.status}
                  >
                    <NativeSelectOption value="">Any status</NativeSelectOption>
                    {DASHBOARD_STATUSES.map((status) => (
                      <NativeSelectOption key={status} value={status}>
                        {status}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sort">Sort</Label>
                  <NativeSelect
                    id="sort"
                    name="sort"
                    defaultValue={filters.sort}
                  >
                    <NativeSelectOption value="sent">
                      Sent date
                    </NativeSelectOption>
                    <NativeSelectOption value="viewed">
                      Viewed date
                    </NativeSelectOption>
                    <NativeSelectOption value="completed">
                      Completed date
                    </NativeSelectOption>
                    <NativeSelectOption value="title">
                      Document name
                    </NativeSelectOption>
                    <NativeSelectOption value="template">
                      Template
                    </NativeSelectOption>
                    <NativeSelectOption value="status">
                      Status
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="from">From (UTC)</Label>
                  <Input
                    id="from"
                    name="from"
                    type="date"
                    defaultValue={filters.from}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="to">To (UTC)</Label>
                  <Input
                    id="to"
                    name="to"
                    type="date"
                    defaultValue={filters.to}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="direction">Direction</Label>
                  <NativeSelect
                    id="direction"
                    name="direction"
                    defaultValue={filters.direction}
                  >
                    <NativeSelectOption value="desc">
                      Newest first
                    </NativeSelectOption>
                    <NativeSelectOption value="asc">
                      Oldest first
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                {admin ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="employee">Employee</Label>
                      <NativeSelect
                        id="employee"
                        name="employee"
                        defaultValue={filters.employeeId}
                      >
                        <NativeSelectOption value="">Anyone</NativeSelectOption>
                        {employees[0].map((employee) => (
                          <NativeSelectOption
                            key={employee.id}
                            value={employee.id}
                          >
                            {employee.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="template">Template</Label>
                      <NativeSelect
                        id="template"
                        name="template"
                        defaultValue={filters.templateId}
                      >
                        <NativeSelectOption value="">
                          Any template
                        </NativeSelectOption>
                        {templates[0].map((template) => (
                          <NativeSelectOption
                            key={template.id}
                            value={template.id}
                          >
                            {template.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                  </>
                ) : null}
                <div className="flex items-end">
                  <Button type="submit" variant="outline">
                    Apply
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Document</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Recipient</TableHead>
                    {admin ? <TableHead>Employee</TableHead> : null}
                    <TableHead>Sent</TableHead>
                    <TableHead>Viewed</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((document) => (
                    <TableRow key={document.id}>
                      <TableCell className="pl-6 font-medium">
                        <Link
                          className="underline"
                          href={`/admin/documents/${document.id}`}
                        >
                          {document.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {document.templateName} · v{document.versionNumber}
                      </TableCell>
                      <TableCell>
                        <p>{document.recipientName || '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {document.recipientEmail}
                          {document.extraRecipients
                            ? ` +${document.extraRecipients}`
                            : ''}
                        </p>
                      </TableCell>
                      {admin ? (
                        <TableCell>{document.employeeName}</TableCell>
                      ) : null}
                      <TableCell>{formatWhen(document.sentAt)}</TableCell>
                      <TableCell>{formatWhen(document.viewedAt)}</TableCell>
                      <TableCell>{formatWhen(document.completedAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{document.status}</Badge>
                      </TableCell>
                      <TableCell className="pr-6">
                        <div className="flex flex-col items-start gap-1 text-xs">
                          <Link
                            className="underline"
                            href={`/admin/documents/${document.id}`}
                          >
                            View
                          </Link>
                          {document.status === 'Draft' ? (
                            <Link
                              className="underline"
                              href={`/admin/send?draft=${document.id}`}
                            >
                              Continue
                            </Link>
                          ) : null}
                          {document.status === 'Completed' ? (
                            <>
                              <a
                                className="underline"
                                href={`/api/envelopes/${document.id}/pdf`}
                              >
                                PDF
                              </a>
                              <a
                                className="underline"
                                href={`/api/envelopes/${document.id}/certificate`}
                              >
                                Certificate
                              </a>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {result.rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        className="pl-6 text-muted-foreground"
                        colSpan={admin ? 9 : 8}
                      >
                        No documents match these filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between px-6 py-4 text-sm">
                <span>
                  Page {result.page} of {pages}
                </span>
                <div className="flex gap-3">
                  {result.page > 1 ? (
                    <Link
                      className="underline"
                      href={href({ page: String(result.page - 1) })}
                    >
                      Previous
                    </Link>
                  ) : null}
                  {result.page < pages ? (
                    <Link
                      className="underline"
                      href={href({ page: String(result.page + 1) })}
                    >
                      Next
                    </Link>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: typeof FileSignatureIcon;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm ${
        active
          ? 'bg-white/11 font-medium text-white'
          : 'text-white/62 hover:bg-white/7 hover:text-white'
      }`}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : (value ?? '');
}

function searchHref(
  query: Record<string, string | string[] | undefined>,
  patch: Record<string, string>,
) {
  const next = new URLSearchParams();
  for (const key of [
    'q',
    'status',
    'from',
    'to',
    'employee',
    'template',
    'sort',
    'direction',
    'page',
  ]) {
    const value = patch[key] ?? first(query[key]);
    if (value) next.set(key, value);
  }
  return next.toString();
}

function formatWhen(value: string | null) {
  if (!value) return '—';
  return value.replace('T', ' ').slice(0, 16);
}
