import {
  ArchiveIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  Clock3Icon,
  FileSignatureIcon,
  FilesIcon,
  LayoutDashboardIcon,
  PlusIcon,
  SearchIcon,
  Settings2Icon,
  ShieldCheckIcon,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LegalExportButton } from '@/components/legal-export-button';
import { LegalExportWebMcp } from '@/components/legal-export-webmcp';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireChatGPTUser } from '@/app/chatgpt-auth';

export const dynamic = 'force-dynamic';

const documents = [
  {
    name: 'Medication Administration Refresher',
    recipient: 'Demo employee',
    status: 'Awaiting trainer',
    statusClass: 'bg-amber-50 text-amber-800 ring-amber-200',
    progress: '1 of 2 signed',
    due: 'Sep 23',
  },
  {
    name: 'FHP Contractor Agreement',
    recipient: 'Demo contractor',
    status: 'Completed',
    statusClass: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    progress: '2 of 2 signed',
    due: 'Sep 17',
  },
  {
    name: 'Background Authorization Form',
    recipient: 'Demo applicant',
    status: 'Viewed',
    statusClass: 'bg-sky-50 text-sky-800 ring-sky-200',
    progress: '0 of 1 signed',
    due: 'Sep 25',
  },
  {
    name: 'Medication Administration Policies',
    recipient: 'Demo staff member',
    status: 'Sent',
    statusClass: 'bg-stone-100 text-stone-700 ring-stone-200',
    progress: '0 of 2 signed',
    due: 'Sep 27',
  },
];

const navigation = [
  { label: 'Overview', icon: LayoutDashboardIcon, href: '/', active: true },
  { label: 'Documents', icon: FileSignatureIcon, href: '/#documents' },
  { label: 'Templates', icon: FilesIcon, href: '/#templates', count: '9' },
  { label: 'Archive', icon: ArchiveIcon, href: '/#archive' },
];

export default async function Home() {
  const user = await requireChatGPTUser('/');
  const initials = user.displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <main className="min-h-screen bg-[#f7f5f2] text-foreground">
      <LegalExportWebMcp />
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[244px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-[#241820] px-5 py-6 text-white lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#ed6435] shadow-[inset_0_0_0_1px_rgb(255_255_255/18%)]">
              <FileSignatureIcon className="size-5" />
            </div>
            <div>
              <p className="text-[15px] font-semibold leading-tight">
                Engage Sign
              </p>
              <p className="mt-0.5 text-xs text-white/55">Secure agreements</p>
            </div>
          </div>

          <nav aria-label="Primary" className="mt-10 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                  item.active
                    ? 'bg-white/11 font-medium text-white'
                    : 'text-white/62 hover:bg-white/7 hover:text-white'
                }`}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
                {item.count ? (
                  <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-white/70">
                    {item.count}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.055] p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheckIcon className="size-4 text-[#ff9068]" />
              Audit protection on
            </div>
            <p className="mt-2 text-xs leading-5 text-white/55">
              Every signing action is timestamped, hashed, and retained.
            </p>
          </div>

          <Link
            href="/#settings"
            className="mt-3 flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-white/62 hover:bg-white/7 hover:text-white"
          >
            <Settings2Icon className="size-4" />
            Settings
          </Link>
        </aside>

        <section className="min-w-0">
          <header className="flex h-[72px] items-center justify-between border-b border-black/[0.07] bg-white/80 px-5 backdrop-blur sm:px-8 lg:px-10">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-xl bg-[#ed6435] text-white">
                <FileSignatureIcon className="size-4" />
              </div>
              <span className="font-semibold">Engage Sign</span>
            </div>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
              <span className="font-medium text-foreground">Overview</span>
              <span>/</span>
              <span>Signing operations</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Search">
                <SearchIcon />
              </Button>
              <div
                className="ml-1 flex size-9 items-center justify-center rounded-full bg-[#efe8e3] text-xs font-semibold text-[#5a3b4f]"
                title={user.email}
              >
                {initials || 'ES'}
              </div>
            </div>
          </header>

          <div className="px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#a04d31]">
                  Friday, September 18
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#2c2028]">
                  Document signing
                </h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  Send forms, follow each signer, and preserve a defensible
                  record from one workspace.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LegalExportButton />
                <Button size="lg" className="bg-[#ed6435] hover:bg-[#d9552a]">
                  <PlusIcon data-icon="inline-start" />
                  Send document
                </Button>
              </div>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Awaiting signatures"
                value="6"
                note="3 need your signature"
                icon={Clock3Icon}
              />
              <MetricCard
                label="Completed this month"
                value="18"
                note="All audit records sealed"
                icon={CheckCircle2Icon}
              />
              <MetricCard
                label="Expiring soon"
                value="2"
                note="Within the next 7 days"
                icon={ArrowUpRightIcon}
              />
              <MetricCard
                label="Baseline templates"
                value="9"
                note="6 Word · 3 scanned PDF"
                icon={FilesIcon}
              />
            </div>

            <Card
              id="documents"
              className="mt-6 scroll-mt-6 gap-0 py-0 shadow-[0_12px_35px_rgb(51_35_44/5%)]"
            >
              <CardHeader className="border-b px-5 py-5 sm:px-6">
                <CardTitle>Documents in progress</CardTitle>
                <CardDescription>
                  Track partial completion across every assigned signer.
                </CardDescription>
                <CardAction>
                  <Button variant="ghost" size="sm">
                    View all
                    <ArrowUpRightIcon data-icon="inline-end" />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-[#faf9f7] hover:bg-[#faf9f7]">
                      <TableHead className="pl-5 sm:pl-6">Document</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Signing progress</TableHead>
                      <TableHead className="pr-5 text-right sm:pr-6">
                        Due
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((document) => (
                      <TableRow key={document.name} className="h-[68px]">
                        <TableCell className="pl-5 font-medium text-[#2c2028] sm:pl-6">
                          {document.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {document.recipient}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={document.statusClass}
                          >
                            {document.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {document.progress}
                        </TableCell>
                        <TableCell className="pr-5 text-right text-muted-foreground sm:pr-6">
                          {document.due}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
              <Card
                id="archive"
                className="scroll-mt-6 bg-[#2c2028] text-white ring-0"
              >
                <CardHeader>
                  <CardTitle className="text-white">Legal archive</CardTitle>
                  <CardDescription className="max-w-xl text-white/58">
                    Export signed PDFs, document versions, signer evidence,
                    audit events, and SHA-256 checksums as one portable package.
                  </CardDescription>
                  <CardAction>
                    <ShieldCheckIcon className="size-5 text-[#ff9068]" />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4 text-xs text-white/58">
                    <span>Last export: Never</span>
                    <span className="h-3 w-px bg-white/15" />
                    <span>Retention: Forever</span>
                  </div>
                  <LegalExportButton placement="card" />
                </CardContent>
              </Card>

              <Card id="templates" className="scroll-mt-6">
                <CardHeader>
                  <CardTitle>Template readiness</CardTitle>
                  <CardDescription>
                    Initial mapping across the nine source forms.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ReadinessRow label="Word templates" value="6 mapped" />
                  <ReadinessRow label="Scanned PDFs" value="3 overlays" />
                  <ReadinessRow
                    label="Needs content review"
                    value="2 forms"
                    warning
                  />
                </CardContent>
              </Card>
            </div>

            <Card id="settings" className="mt-4 scroll-mt-6">
              <CardHeader>
                <CardTitle>Signing policy defaults</CardTitle>
                <CardDescription>
                  Applied to new documents unless an administrator overrides
                  them.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <ReadinessRow label="Expiration" value="14 days" />
                <ReadinessRow label="Reminders" value="7, 3, and 1 day" />
                <ReadinessRow label="Retention" value="Forever" />
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Clock3Icon;
}) {
  return (
    <Card size="sm" className="gap-4 shadow-[0_8px_24px_rgb(51_35_44/4%)]">
      <CardHeader>
        <CardDescription className="font-medium">{label}</CardDescription>
        <CardAction>
          <div className="flex size-8 items-center justify-center rounded-lg bg-[#f3ece8] text-[#a04d31]">
            <Icon className="size-4" />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-[-0.04em] text-[#2c2028]">
          {value}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}

function ReadinessRow({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          warning ? 'text-sm font-medium text-amber-700' : 'text-sm font-medium'
        }
      >
        {value}
      </span>
    </div>
  );
}
