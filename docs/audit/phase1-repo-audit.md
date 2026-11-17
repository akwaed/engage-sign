# Phase 1 repository audit

Audit date: 2026-11-17. The first pass read git only. The same day, a read-only VPS audit and a source snapshot of release `20260930-consent` were compared with git. This document now uses that snapshot as the description of production. Nothing on the server was changed.

The attached Kentucky TB form was inspected locally for structure (page count, images, text layer, AcroForm). None of its handwritten entries, signature, or other personal data is copied here.

## Production baseline

`https://sign.engagess.co` is the OVH VPS `vps-c38077a1` (Ubuntu 24.04). nginx 1.24 terminates TLS and proxies to `127.0.0.1:3000`. systemd unit `engage-sign-vps.service` runs Node 22.23.3 as user `engage-sign` from `/opt/engage-sign-vps/current` → `releases/20260930-consent`. MySQL 8.0.46 on loopback holds database `engage_sign_vps`. The app user has only SELECT, INSERT, UPDATE, and DELETE. Migrations `000` through `003` are recorded in `schema_migrations`. Private files are in `/var/lib/engage-sign-vps/private` (mode 0700). `engage-sign-jobs.timer` runs `scripts/vps/jobs.ts` every 60 seconds (expiration, reminders, outbox). A daily backup timer runs at 06:00 UTC.

The deployed tree was not on any GitHub branch. The build checkout was local branch `codex/vps-migration` at orphan commit `4c81f9d`, plus uncommitted production changes. That tree is now `prod-baseline-20260930` at `215be13`, parent `4c81f9d`. It is the baseline for later work. `main` (`e062648`) is an older staff-auth snapshot and is not what production runs.

Production SMTP is nodemailer to `smtp.office365.com:587` with STARTTLS and basic auth (`SMTP_USER` / `SMTP_PASSWORD`, no OAuth). Journaled sends succeed. The September 2026 note that GoDaddy blocked port 587 describes the old host, not this VPS. `MAIL_ENABLED` must be `true` for the timer to dispatch.

Compared with `4c81f9d`, the release removes the GoDaddy, Cloudflare, vinext, ChatGPT-auth, and Drizzle paths, rewrites mail, finalization, and archive code, and removes the `SETUP_TOKEN` check from `POST /api/setup`. First-admin setup is gated only by an empty `users` table.

nginx overwrites `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-For`, and `X-Real-IP`. The forwarded-header concern in the original repo pass is mitigated on this vhost. A second vhost, `vps-c38077a1.vps.ovh.us`, proxies to the same app.

## 1. What is in git

`main` is `e062648` (2026-09-22, "Use public proxy origin for redirects"). `origin/codex/signing-workflow` is `90fc2df` (2026-09-23). The merge-base of those two refs is `e062648`, so the signing branch is a strict fast-forward of `main` (18 commits) and has not been merged.

| Tree                                         | What it contains                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main` (default branch, CI target)           | Staff sign-in, administrator user management, MySQL schema, legal-export ZIP, hardcoded dashboard. No SMTP client, no PDF library, no signing routes, no tests. |
| `origin/codex/template-workflow` (`f117844`) | Ancestor of the signing branch. Template upload, private storage, PDF coordinate mapper for the nine catalog forms.                                             |
| `origin/codex/signing-workflow` (`90fc2df`)  | Everything on `main`, plus templates, envelopes, recipient signing, AES-256-GCM, nodemailer SMTP, and unit tests.                                               |

`lib/auth/password.ts`, `lib/auth/session.ts`, and the login, logout, setup, and user-admin routes are the same on `main` and on the signing branch. Later phases should extend that code, not replace it.

`docs/GODADDY_DEPLOYMENT.md` on `90fc2df` records that on 2026-09-23 GoDaddy Preview blocked TCP to `smtp.office365.com:587` with `EACCES`. That note is historical. Production mail on the VPS works. LibreOffice is installed at `/usr/bin/soffice`.

The GitHub history before `prod-baseline-20260930` has no nginx unit, systemd unit, or VPS deploy script. Those live on the server, outside the release tarball. `docs/VPS_MIGRATION.md` in the baseline is still a planning checklist and does not match the running host line for line.

## 2. Stack

Production runtime, both trees: Next.js App Router route handlers on Node. There is no separate API process.

| Piece             | Version (locked)                                                                                          | Where it is used                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Node              | `>=22.13.0` (`package.json` engines; CI uses Node 22)                                                     | Runtime                                                                |
| Next.js           | 16.3.5                                                                                                    | App Router, `next dev --webpack`, `next build --webpack`, `next start` |
| React / React DOM | 19.2.6                                                                                                    | UI                                                                     |
| TypeScript        | 5.9.3                                                                                                     | Strict                                                                 |
| Tailwind CSS      | 4.2.1                                                                                                     | `app/globals.css`, PostCSS                                             |
| UI kit            | `@base-ui/react` 1.7.0, `@shadcn/react` 0.3.0, `shadcn` 4.18.0, plus the components under `components/ui` | Dashboard, login, users                                                |
| MySQL driver      | `mysql2` 3.24.4                                                                                           | All production queries in `lib/mysql.ts`                               |
| Drizzle ORM       | `drizzle-orm` 0.45.2                                                                                      | `db/index.ts` only, against Cloudflare D1                              |
| Drizzle Kit       | 0.31.10                                                                                                   | `drizzle.config.ts` dialect is `sqlite`                                |
| ZIP               | `fflate` 0.8.3                                                                                            | Legal archive                                                          |
| Lint / format     | oxlint 1.76.0, oxfmt 0.61.0                                                                               | CI                                                                     |

Present only on `origin/codex/signing-workflow`:

| Package      | Locked version | Role                                                |
| ------------ | -------------- | --------------------------------------------------- |
| `nodemailer` | 10.0.10        | SMTP client                                         |
| `pdf-lib`    | 1.17.1         | PDF read, overlay, evidence page, audit certificate |
| `pdfjs-dist` | 6.3.289        | Browser preview canvas in the template manager      |

Also in the repo, and not on the GoDaddy/VPS request path: Vite 8.0.13, `vinext` 1.0.0-beta.5, Wrangler 4.92.0, `@cloudflare/vite-plugin`. Scripts `sites:dev`, `sites:build`, and `sites:start` are the older Cloudflare/OpenAI Sites preview. `db/index.ts` imports `cloudflare:workers`. The Next.js pages do not import it. `.openai/hosting.json` names a D1 binding `DB` and an R2 binding `FILES`.

### Database and migrations

Production schema is hand-written MySQL 8 SQL, not Drizzle.

- Baseline: `database/mysql/schema.sql` (full `CREATE TABLE`, plus append-only triggers).
- Signing branch additions, in order:
  - `database/mysql/migrations/001_template_lifecycle.sql` adds `template_versions.lifecycle`, `activated_at`, `retired_at`.
  - `database/mysql/migrations/002_signing_workflow.sql` adds envelope routing/lock columns, signer token-use columns, `signer_sessions`, `notification_outbox`.
  - `database/mysql/migrations/003_final_archive_and_mail.sql` adds `final_archives` and outbox retry columns.
- There is no migration runner script and no `db:migrate` npm script. `npm run db:generate` only runs `drizzle-kit generate` for the SQLite schema.
- `drizzle/0000_legal_scarlet_witch.sql` and `drizzle/0001_light_shooting_star.sql` are SQLite. They do not create `staff_sessions`, `password_reset_tokens`, `users.status`, or lockout columns. Do not apply them to MySQL.

The GoDaddy guide says **Import SQL drops every existing table** before running the uploaded file. Re-importing `schema.sql`, or uploading a migration by itself through that importer, is destructive. A normal `mysql` client on a VPS does not do that. Production migrations still need a backup and an additive script either way.

`lib/mysql.ts` connects with `DATABASE_URL`, or with `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`. It also accepts `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, and `MYSQL_PASSWORD`. The pool sets `timezone: 'Z'` and `dateStrings: true`. Queries use placeholders.

## 3. Authentication, sessions, and accounts

Implemented on `main` and unchanged on the signing branch.

### Passwords

`lib/auth/password.ts` uses Node `scrypt` (N=16384, r=8, p=1, 64-byte key, 16-byte salt, `maxmem` 64 MiB). Stored form: `scrypt-v1$<N>$<r>$<p>$<salt>$<key>`, base64url. Comparison uses `timingSafeEqual`. Minimum length 14, maximum 200. This is the hash format to keep. Do not rehash accounts as a side effect of a later deploy.

### Sessions

`lib/auth/session.ts`:

- Cookie name `engage_sign_session`.
- Token: 32 bytes from `randomBytes`, stored as SHA-256 hex in `staff_sessions.token_hash`. The raw token is not stored.
- Lifetime: 12 hours from creation. `last_seen_at` is updated and does not extend expiry.
- Flags: `HttpOnly`, `SameSite=Lax`, `Path=/`. `Secure` is set only when `NODE_ENV === 'production'`.
- Lookup requires `revoked_at IS NULL`, unexpired, and `users.status = 'active'`.
- Logout revokes the current session. Disabling a user or an administrator password reset revokes all of that user's sessions.

### Login controls

`app/api/auth/login/route.ts`:

- `assertSameOrigin` before the password check.
- Disabled accounts are rejected before the password check.
- Five failures set `locked_until` 15 minutes ahead and reset `failed_login_count` to 0.
- Unknown emails still run scrypt so the missing-user path is not trivially faster than a bad password. Disabled and locked accounts return early, so those states are distinguishable.
- Error codes `invalid`, `locked`, `disabled`, and `request` are distinct. That confirms whether an email is a disabled or locked account.
- Successful login writes audit event `STAFF_LOGIN_SUCCEEDED`. Failures are not audited.
- `returnTo` is limited by `safeReturnTo` to a single leading slash that is not `//`.

### Setup and user administration

- `POST /api/setup` creates the first user as `admin` only when `users` is empty, a MySQL named lock is held, and `SETUP_TOKEN` matches (SHA-256 of both sides, then `timingSafeEqual`). The page redirects to `/login` once any user exists. If every user row were deleted while `SETUP_TOKEN` was still set, setup would open again.
- `POST /api/admin/users` is admin-only: create, enable, disable, and set a new password. Create accepts role `admin` or `staff` only. The last active admin cannot be disabled. An admin cannot disable themselves. Password reset stores a new scrypt hash and revokes sessions. There is no email.
- `password_reset_tokens` exists in `database/mysql/schema.sql` (`token_hash CHAR(64)`, `expires_at`, `used_at`) and has no readers or writers.
- UI: `/login`, `/setup`, `/admin/users`. No forgot-password page, no role editor, no search, no activity list, no per-session revoke button.

### Roles today

MySQL `users.role` is `ENUM('admin','staff')`. Server checks are `role === 'admin'` versus any signed-in user. There is no permission table.

On the signing branch, these routes require `admin`: template upload and mapping, send, document detail, archive download, mail verify/run/retry, legal export. A `staff` user can sign in and is not an external signer. External recipients have no user row; they use the signing token on that branch.

Requested roles (Administrator, Template Manager, Standard User, Patient/External Signer) are not implemented. Patient access without an account is how the signing branch is shaped; the staff role is not split.

### Unused header auth

`app/chatgpt-auth.ts` reads `oai-authenticated-user-*` headers and is not referenced by any route. Those headers are unsigned. Do not attach them to staff sign-in.

## 4. Documents, templates, and storage

### On `main`

- `lib/template-catalog.ts` is a static list of nine employment and training forms (six DOCX, three PDF) with source SHA-256, page counts, signer roles, and field-name groups. The source files are not in the repo.
- The home page (`app/page.tsx`) renders four hardcoded rows ("Demo employee", "Demo contractor", and similar) and fixed counts. Search, "Send document", and "View all" do not call the database.
- Schema tables `templates`, `template_versions`, `template_fields`, `envelopes`, `signers`, `field_values`, `document_versions`, and `signature_events` have no application writers on `main`.
- `PRIVATE_STORAGE_PATH` is read only by `app/api/legal-export/route.ts`. The export refuses to run if a referenced file is missing, the path is absolute, or the resolved path escapes the root. Nothing in `main` writes files there.
- Encrypted-value columns exist. No encryption function exists on `main`. `ip_address_encrypted` is inserted as `NULL` by `lib/audit.ts`. IP material is an HMAC in `details_json` under `ipHash` when `IP_HASH_SECRET` is set.

### On the signing branch

Private files (`lib/private-storage.ts`):

- Root must be absolute and outside both the application directory and `public/`.
- Keys must match `templates|documents|signatures/<uuid>/<uuid>.(docx|pdf|enc|zip)`.
- Directories are created mode `0700`, files mode `0600`, exclusive create. The root must not be a symlink. Reads use `realpath` and reject escape.
- This is application-level privacy, not disk encryption. It depends on the host actually honoring Unix modes and on the directory not being aliased by the web server.

Templates (`app/api/admin/templates/route.ts`, `components/template-manager.tsx`):

- Upload is limited to the nine catalog slugs. The first version of each slug must match `sourceHash` and the catalog filename.
- Checks: extension, 20 MB cap, PDF `%PDF-` header and `PDFDocument.load`, or DOCX PK zip with `[Content_Types].xml` and `word/document.xml`.
- Versions are `draft`, `active`, or `retired`. Field saves are allowed on drafts. Activation retires the previous active version. Rollback can make a retired version active again.
- New sends require `lifecycle = 'active'` and store `envelopes.template_version_id`. `locked_at` is set when status becomes `sent`.
- Draft envelopes can still change template version and admin-fill values until send. Signers and field values for an unsent draft are deleted and reinserted on edit.
- PDF preview uses pdf.js. Placement is a click that sets the top-left of the selected field on a 0–1000 grid, plus numeric width and height. Overlay boxes are `pointer-events-none`. There is no drag, resize handle, zoom control, alignment, or keyboard move. Preview scale is fixed at 1.3.
- Field types in code: `text`, `date`, `checkbox`, `radio`, `initials`, `signature`. No multiline, dropdown, email, or phone type. Radio has no group id. Checkbox and radio paint the letter `X`. Text is a single Helvetica line and the fill throws if the string does not fit the box.

Documents:

- `POST /api/envelopes` (admin) saves a draft or sends it. Sending builds a prepared PDF, hashes it, and queues mail.
- Home page queries real `envelopes` rows, limited to 20, with **no** `created_by` filter. Any staff session sees every document title and status. Detail and download routes are admin-only, so staff see titles they cannot open.
- Status values stored: `draft`, `sent`, `viewed`, `partially_signed`, `completed`, `declined`, `expired`, `voided`. There is no `canceled` or `failed` envelope status. Mail failure lives on `notification_outbox.status`.
- Signer name and email are AES-256-GCM ciphertext. Envelope `title` is plaintext.
- Completed envelopes can build `final_archives` (final PDF hash, certificate hash, ZIP hash, private storage key). Download is admin-only.

`GET /` on the signing branch also calls `expireDueEnvelopes()`, so opening the dashboard mutates due documents.

## 5. PDF rendering and signing

Not present on `main`.

On the signing branch:

- Overlay path (`lib/template-files.ts`): `pdf-lib` draws text or `X` into normalized boxes. Drawn signatures are embedded PNGs scaled into signature boxes. An extra "Electronic signature evidence" page is appended (signer name, role, UTC time, method, presented-document SHA-256).
- DOCX path (`lib/docx-convert.ts`): placeholders `{{field_name}}` are replaced, then LibreOffice (`LIBREOFFICE_BIN` or `soffice`) converts to PDF with a 60-second kill. The branch notes record `LibreOffice is unavailable on this host` for the GoDaddy runtime. PDF templates do not need LibreOffice.
- Recipient link `GET /s/[token]` (`app/s/[token]/route.ts`): 43-character base64url token, SHA-256 lookup, checks unused, unexpired, and envelope still open. It inserts a `presented` document version, sets cookie `engage_sign_recipient` (32-byte token, SHA-256 at rest, 30 minutes, `HttpOnly`, `SameSite=Strict`, `Secure` when the public origin is HTTPS), and redirects to `/sign/[envelopeId]` with `Referrer-Policy: no-referrer`. The invitation token is not marked used on open, so a mail-scanner prefetch does not burn it. Each open does insert another presented row and session.
- Signing page (`components/signing-form.tsx`): assigned fields, typed or drawn signature, review step, consent checkbox. `POST /api/signing` requires the recipient cookie and same-origin.
- Submit (`lib/signing-actions.ts`): locks the envelope, checks the presented PDF hash against private storage, rejects fields not assigned to that signer role, encrypts values, writes the signed PDF, sets `token_used_at`, revokes other recipient sessions, and records `DOCUMENT_SIGNED`. A matching resubmit returns the earlier success. Drawn PNG is limited (magic bytes, 180 KB, dimension cap).
- Consent text is a draft string in code. The signing notes say counsel has not approved it.
- Verification method is not a column. The flow is email link only. There is no email OTP.

Token properties already implemented on that branch: `randomBytes(32)`, only the SHA-256 hash stored, hash unique on `signers.token_hash`, bound to one signer row (and therefore one envelope), expiry copied from the envelope, rejected after `token_used_at` or a closed status. The raw token appears in the invitation URL path `/s/<token>`. It is not in the message subject. It can still be stored by mail gateways and by any reverse proxy that logs request paths.

## 6. SMTP

`main` does not import a mail library and does not read `SMTP_USER` or `SMTP_PASSWORD`. `.env.example` lists the keys and tells operators to leave them blank. `docs/GODADDY_DEPLOYMENT.md` on `main` says email is not implemented.

The signing branch is the SMTP implementation, in `lib/signing-mail.ts`:

- Library: nodemailer 10.0.10.
- Auth: `auth: { user: SMTP_USER, pass: SMTP_PASSWORD }`. This is SMTP basic authentication. There is no OAuth, no Microsoft Graph client, and no XOAUTH2.
- Host and port from `SMTP_HOST` and `SMTP_PORT`. Port must be 587 or 465. `secure` is true only for 465. `requireTLS: true`, `tls.rejectUnauthorized: true`, `minVersion: 'TLSv1.2'`. `SMTP_SECURE` in `.env.example` is not read.
- From `SMTP_FROM`, optional `SMTP_REPLY_TO`. `APP_URL` must be HTTPS unless the hostname is `localhost`.
- Logger and debug are off. Provider responses are stripped of URLs and long tokens before they are stored (`lib/mail-security.ts`).
- Messages go through `notification_outbox` (pending, sending, sent, failed), with retry backoff and a manual admin action at `POST /api/admin/mail` (`verify`, `run`, `retry`). `verify` does not send mail. There is no cron definition in the repo.
- Kinds in `lib/mail-templates.ts`: `invite`, `next_signer`, `reminder_<days>`, `completion`, `expiration`, `decline`, `void`. No password-reset message.
- Body includes the recipient name and the envelope title, plus the raw signing URL for invite and next-signer. Completion mail tells the recipient to contact an administrator. PDFs are not attached.
- The token hash is updated **before** `sendMail`. If the SMTP conversation fails, a retry mints a new token. A process crash after the server accepts the message and before the outbox row is marked sent can leave delivery state wrong until an operator runs the job again.

Preserve this transport. Do not replace it with OAuth or with a different provider API. Later mail (reset, reminder, completed, expired, canceled) should enqueue through `notification_outbox` and this transporter.

Environment names only (values are not in git):

- Connection: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (aliases `DATABASE_URL`, `MYSQL_*`).
- App: `SETUP_TOKEN`, `IP_HASH_SECRET`, `PRIVATE_STORAGE_PATH`, `APP_URL`, `PORT` (assigned by the host, not listed in `.env.example`).
- Mail: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_REPLY_TO`.
- Signing branch only: `ENCRYPTION_KEY_V1`, `LIBREOFFICE_BIN`.

`ENCRYPTION_KEY_V1` must be standard base64 of exactly 32 bytes. `lib/encryption.ts` uses AES-256-GCM with a 12-byte IV and the context string as AAD. Version prefix is `v1`. The `encryption_key_version` column defaults to 1 and is not updated independently. There is no rotation routine.

## 7. Audit log and security controls

### Audit log

`lib/audit.ts` (both trees) appends a row whose `event_hash` is SHA-256 of a JSON object containing id, envelope id, actor, event type, details, user agent, timestamp, and `previous_hash`. The previous hash is `SELECT event_hash ... ORDER BY occurred_at DESC, id DESC LIMIT 1 FOR UPDATE`. Timestamps are UTC (`toISOString`, MySQL `UTC_TIMESTAMP(6)`). JavaScript timestamps have millisecond precision.

MySQL triggers in `schema.sql` reject `UPDATE` on `audit_events`, `document_versions`, and `legal_exports`, and reject `DELETE` on `audit_events` unless the session variable `@engage_retention_purge` is 1. The retention job does not exist. Triggers are not a control against an account that can drop triggers.

Gaps:

- The chain is an unkeyed SHA-256. Someone who can rewrite the table can recompute every hash. There is no external anchor and no HMAC key.
- Ordering is by timestamp and random UUID, not by a monotonic sequence. A verifier must follow `previous_hash`, not `occurred_at`.
- `audit_events.envelope_id` is `ON DELETE CASCADE`. Deleting an envelope deletes its audit rows. The trigger does not run for a cascading foreign-key delete in the way a direct `DELETE` does; the cascade is a hole in the "append-only" story.
- `signature_events`, `field_values`, `signers`, and `document` storage keys on other tables have no immutability trigger. On the signing branch the IP and user agent for a signature are encrypted into `signature_events`, and that row is not covered by the hash chain. The audit event `DOCUMENT_SIGNED` records the PDF hash and method, not the IP.
- `ip_address_encrypted` on `audit_events` is always `NULL`. `hashClientIp` is HMAC-SHA256 with `IP_HASH_SECRET`, or `NULL` if the secret is missing, and it is copied into `details_json`. The raw IP is discarded on `main`. On the signing branch the signature path encrypts the raw IP instead of hashing it, and it trusts the first `X-Forwarded-For` hop.
- `value_hash` on field values is unsalted SHA-256 of the plaintext. Checkbox, date, and other low-entropy values can be recovered from the hash.
- No in-repo verifier walks the chain. The legal export copies events and checksums the ZIP; it does not recompute `event_hash`.
- `FIRST_ADMIN_CREATED` stores the administrator email inside `details_json`.

### Other controls

| Control          | State                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSRF             | `assertSameOrigin` compares `Origin` to a public origin. If `X-Forwarded-Host` and `X-Forwarded-Proto` are present and look like a host, they win over `APP_URL`. The leftmost forwarded value is used. `SameSite=Lax` on the staff cookie blocks typical cross-site form posts. There is no CSRF token. State changes are POST, except `GET /s/[token]` on the signing branch, which creates a session.                                                            |
| XSS              | React escapes text. Mail HTML is escaped in `renderMail`. No `Content-Security-Policy` on HTML. `next.config.ts` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a locked-down `Permissions-Policy`, and HSTS `max-age=31536000; includeSubDomains`. `poweredByHeader` is false. The template file response on the signing branch sets `Content-Security-Policy: default-src 'none'; sandbox`. |
| SQL injection    | Production queries seen in this audit use `mysql2` placeholders. Template and signing code on the branch do the same. No string-built SQL from request fields was found.                                                                                                                                                                                                                                                                                            |
| Rate limiting    | Per-account login lockout only. No IP limit, no limit on setup, legal export, signing submit, or mail `run`.                                                                                                                                                                                                                                                                                                                                                        |
| Uploads          | None on `main`. Signing branch: type, size, magic bytes, PDF parse or DOCX structure, catalog hash for baselines. No malware scan, no page-count cap beyond the 20 MB limit.                                                                                                                                                                                                                                                                                        |
| Token handling   | Session and signing tokens are 256-bit and stored as SHA-256. Password-reset tokens are schema-only. Signing URL contains the raw invitation token until the redirect.                                                                                                                                                                                                                                                                                              |
| Security headers | See XSS row. HTTPS redirect is not implemented in the app; it depends on the proxy, which is not in the repo.                                                                                                                                                                                                                                                                                                                                                       |
| Cookies          | Staff `Secure` depends on `NODE_ENV`. Recipient `Secure` on the signing branch depends on the public origin scheme. No `__Host-` prefix.                                                                                                                                                                                                                                                                                                                            |
| Error bodies     | Several signing and template handlers return `error.message` to the client.                                                                                                                                                                                                                                                                                                                                                                                         |
| Legal export     | `POST /api/legal-export` is admin-only and same-origin. It dumps staff directory data, signer rows (ciphertext and token hashes), field values, audit events, and private files. `LegalExportWebMcp` registers a browser tool that calls the same endpoint when an admin has the dashboard open.                                                                                                                                                                    |
| Health           | `GET /api/health` is unauthenticated and reports `database: connected` or `unavailable`.                                                                                                                                                                                                                                                                                                                                                                            |

`hashClientIp` and the legal-export path traversal checks are the right ideas to keep.

## 8. Deployment in the repository

Documented commands (`docs/GODADDY_DEPLOYMENT.md`):

```text
npm install
npm run build
npm start
```

`npm start` is `next start`, which listens on `PORT`. Preview on GoDaddy is documented as `npm run dev` (`next dev --webpack` because Turbopack could not bind a port in that sandbox). Custom domain in the guide: `sign.engagess.co`. Secrets are GoDaddy Secrets, not files in git.

The signing-branch guide adds warnings about the Import SQL drop behavior, shared Preview and Published database, `PRIVATE_STORAGE_PATH=/private/engage-sign` on that host, and the SMTP egress failure. It also records a hosting app id, SHA-256 values of local SQL exports, and a Windows Downloads path. Those are operational details, not credentials. They should not be copied into new runbooks.

Nothing in git defines how a Linux VPS should run the process (user, working directory, restart policy, TLS terminator, or backup timer). Compatibility work has to follow the VPS snapshot rather than inventing a second hosting layout.

## 9. Tests

`main` has no `test` script, no `tests/` directory, and no test runner. CI (`.github/workflows/ci.yml`) on pull requests and on pushes to `main` runs `npm ci`, `npm run format -- --check`, `npm run lint`, and `npm run build`. It does not start MySQL.

The signing branch adds:

```text
npm test
```

which is `node --experimental-strip-types --test tests/*.test.mts`. CI on that branch does **not** call `npm test`.

| File                                 | What it covers                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `tests/signing-domain.test.mts`      | Token length and uniqueness, routing order, reminder-day validation, AES-GCM round trip with `Buffer.alloc` as the key |
| `tests/template-files.test.mts`      | SHA-256, DOCX merge, PDF fill, drawn signature, evidence page                                                          |
| `tests/baseline-pdf-fields.test.mts` | Static field maps for the three catalog PDFs                                                                           |
| `tests/mail-templates.test.mts`      | Subject and HTML escaping                                                                                              |
| `tests/final-archive.test.mts`       | Archive checksum structure                                                                                             |

Not covered: login, lockout, sessions, RBAC, cross-user reads, upload rejection, token expiry and reuse, audit-chain verification, MySQL, SMTP, or a TB form. The AES test key is generated in the test process. It is not a deployed key.

How to run what exists today, on `main`:

```bash
npm ci
npm run format -- --check
npm run lint
npm run build
```

On the signing branch, add `npm test`. A local MySQL import of `database/mysql/schema.sql` is required before `/setup` can succeed. That database is not provided by CI.

## 10. What works, what does not, what is missing

### Works in code on `main`

Staff setup with a one-time token, scrypt passwords, login, 12-hour hashed sessions, logout, disable with session revocation, last-admin guard, administrator-set passwords, same-origin checks, per-account lockout, auth audit events, security headers listed above, and a legal export that fails closed when private files are missing or hashed differently. `/api/health` reports MySQL connectivity.

### Works in code only on the unmerged branch

Catalog-bound template import, draft field maps, activate/retire/rollback, private file storage, envelope draft and send bound to a template version, recipient link exchange, typed and drawn signatures, PDF overlay, final ZIP, AES-256-GCM for signer identity and signature evidence, and the nodemailer basic-auth outbox. These were not executed in this audit. The branch's own notes say SMTP send and Word conversion were not working on GoDaddy Preview.

### Broken or misleading

- `main` dashboard numbers and document rows are fixtures. They are not a signing queue.
- `password_reset_tokens` is unused. Password reset is an administrator typing a temporary password into a form.
- Two schema sources disagree (MySQL SQL versus Drizzle SQLite).
- Audit "encryption" columns are not written by `main`.
- Signing-branch home page lists every envelope title to every staff user.
- Signing-branch mail includes the document title. For a later clinical template that is a PHI leak even though no PDF is attached.
- `GET /s/[token]` is a state-changing GET.
- CI never runs the unit tests that do exist.

### Missing relative to the product described for later phases

Self-service reset, invite mail, the three staff roles plus publish permission, own-document versus organization views, search/filter/pagination, permission-checked PDF and certificate downloads, a drag-and-drop editor, the extra field types, immutable published versions as a rule for non-admin editors, a TB template that is not one of the nine catalog entries, email OTP readiness as an explicit verification method, generic clinical notification copy, a scheduled sender, a keyed audit chain that covers signature evidence, disk encryption evidence, VPS service definitions, and the automated tests listed in the implementation plan.

## 11. Findings, highest severity first

Severity covers the production release `20260930-consent` and the healthcare use that is planned.

### Critical

1. **Resolved by `prod-baseline-20260930`.** The running source is that branch (`215be13`), not `main`. Further work branches from it. Do not merge it into `main` as if `main` were production.

### High

2. **`POST /api/setup` no longer checks `SETUP_TOKEN`.** It creates an administrator whenever `users` is empty. Production has two users, so the page redirects away today. Emptying `users` would let anyone who can reach `/setup` claim admin. Restore a token check and a permanent setup-completed flag. `SETUP_TOKEN` is still present in the server environment.
3. **Staff can read every document title** on the production dashboard (`app/page.tsx` has no `created_by` predicate). Titles are plaintext. Detail routes are admin-only, which does not fix the list.
4. **Role model cannot express the requested jobs.** Binary `admin`/`staff`, with send/template/mail/export hard-coded to admin. No publish grant, no own-history scope, no way to change a role after create.
5. **Password reset is not self-service and not mailed.** Administrators set a password in the browser and must hand it over. The unused `password_reset_tokens` table is the right place to store a hash; nothing writes it. Reset does revoke sessions, which is the behavior to keep.
6. **Audit evidence is not tamper-evident against a database administrator.** Unkeyed hash, cascade delete from `envelopes`, mutable `signature_events`, IP column unused, no verifier. Fine as a start for staff actions. Not sufficient for a signature certificate.
7. **Unsalted SHA-256 of field plaintext** (`value_hash`) undoes encryption for low-entropy answers (yes/no, dates).
8. **Ordinary email contains the envelope title and the recipient name**, and the invitation URL contains the raw token. No PDF is attached, which matches the requested default. The title does not.
9. **New templates cannot be added without a code change.** Upload rejects any slug outside `templateCatalog`. The TB form cannot be introduced by an operator, and the signed scan must not be forced through that importer.
10. **Forwarded headers.** `getPublicOrigin` still prefers `X-Forwarded-Host`. On this VPS nginx replaces those headers, so a browser cannot spoof them through the public vhost. Keep that proxy behavior. Direct access to port 3000 is not exposed (the process binds loopback).
11. **Full legal export from any admin session**, including a WebMCP tool on the dashboard, with no step-up. The ZIP is designed to contain participant data once signing is real.

### Medium

12. Login lockout is per email only, and the error page distinguishes unknown, locked, and disabled. There is no per-IP or global limit on login, setup, signing links, or the mail runner.
13. Staff cookie `Secure` follows `NODE_ENV`. The unit's environment file sets `NODE_ENV`. Confirm that value stays `production` so the cookie is not sent on plain HTTP.
14. API errors return internal `Error.message` strings (checksum failures, missing binaries, field names).
15. PDF editor cannot drag, resize, align, or zoom, and export is single-line Helvetica. Word conversion uses `/usr/bin/soffice` on the VPS.
16. **Final PDFs, templates, and the imports directory are plaintext on disk.** AES-256-GCM covers signer identity, field values, and signature images. It does not cover the PDF bytes. Disk encryption is an owner decision before real PHI.
17. **Staff sessions last 12 hours absolute with no idle timeout.** `last_seen_at` is updated and does not shorten or extend expiry.
18. `GET /` still calls `expireDueEnvelopes()`. The 60-second jobs timer also expires envelopes, queues reminders, and dispatches the outbox when `MAIL_ENABLED=true`.
19. Invitation token rotation happens before SMTP success. A retry mints a new token. Delivery state is visible on `/admin/mail`.
20. Tests exist (`npm test`, 13 cases on the baseline) and CI does not run them. Nothing covers auth, RBAC, or cross-user access.

### Low

21. `GET /api/health` is unauthenticated. On production it reports `status`, `database`, and `storage` (`ready` / `connected`).
22. **No global Content-Security-Policy.** The PDF file route sets a sandbox policy. HTML responses do not.
23. nginx access logs are off (error log is `crit`), so the edge has no request trail. Signing-token paths would need redaction before access logs are enabled.
24. First-admin audit details include the email address.
25. HSTS is set in the app. nginx redirects port 80 to HTTPS. Certificates renew via certbot (sign.engagess.co expires 2026-12-27; the ovh.us vhost expires 2026-12-22).
26. `safeReturnTo` does not reject `/\` sequences. Redirects are absolute URLs built with the WHATWG parser, so this is not an open redirect in Node, and it should still be tightened.
27. No `__Host-` cookie prefix. Failed logins are not audit events. The failure counter resets to 0 when the lock starts, so the count is not historical.

## 12. Secrets in git history

All 28 commits on all branches were scanned for private-key blocks, cloud and API token prefixes, and assigned `SMTP_PASSWORD`, `SETUP_TOKEN`, `IP_HASH_SECRET`, `ENCRYPTION_KEY_V1`, `DB_PASSWORD`, and `MYSQL_PASSWORD` values.

No private key, populated password, or API token was found.

`.env.example` on every commit leaves secret values empty. Non-secret defaults that are present: `SMTP_HOST` (`smtp.office365.com`), `SMTP_PORT` (`587`), `SMTP_SECURE` (`false`), and `APP_URL` (`https://sign.engagess.co`).

`tests/signing-domain.test.mts` on the signing branch (from `99f90543b947ddf33c7db1a0045bbba1dee76e45` through `90fc2dfab68a16ea94ae93fe3bd22fa44804504f`) sets `process.env.ENCRYPTION_KEY_V1` inside the test to base64 of a fixed in-process buffer. That is a unit-test fixture, not a host key. Do not reuse that pattern for any real environment.

No `.env` file other than `.env.example` has ever been committed. `.gitignore` ignores `.env*` except `.env.example`.

## 13. Attached TB form (structure only)

File inspected outside the repo: the uploaded signed TB PDF. It was not copied into the worktree.

- PDF 1.7, one page, US Letter (612 by 792 points), not encrypted.
- No AcroForm, XFA, annotations, signature widgets, or JavaScript.
- One bilevel CCITT image, 2550 by 3300 pixels (a 300 DPI page scan), plus a Helvetica text layer. Extracted text is sparse and mis-ordered, consistent with a scan plus a thin text layer, not a native fillable form.
- Visible official structure in that text layer includes the Kentucky Department for Public Health tuberculosis risk-assessment heading, a patient-name line, an active-TB symptom screen with "check all that apply" and a skip to Section II, a screener signature line, and date/phone lines. Handwritten answers sit in the image. They are not repeated in this audit.

Use an authoritative blank from the Kentucky Department for Public Health, or redraw the official questions onto a clean page. Do not check the signed scan into git, do not put it in `tests/` or `public/`, and do not "clean" it by painting white boxes over the handwriting. Residual image data would still be the original scan.

## 14. Ops items that need owner approval

These are properties of the VPS, not of the application repo. This project must not change the server to "fix" them. They need an explicit owner decision and a change window.

- SSH allows password authentication (`PasswordAuthentication yes`). `PermitRootLogin` is `without-password`. Prefer key-only SSH.
- `ufw` is inactive. Public listeners are 22, 80, and 443. fail2ban is not installed.
- Backups stay on the same VPS, and the backup decryption key is on that host (`/etc/engage-sign-vps/backup.key`). There is no off-site copy and no pruning. The daily job stops the app during the dump.
- `/var/lib/engage-sign-vps/imports` is mode 0777 and the files in it are mode 0666. It holds the nine source business documents.
- About 66 OS packages are upgradable. Schedule patching separately from app deploys.
- The `ovh.us` hostname serves the same production app. Decide whether that origin should stay.
- Full-disk encryption for private storage is not in place. Required before real PHI, and it is an infrastructure change.
- Staging, as sketched in the VPS notes (`staging.sign.engagess.co`, a second unit, a separate database and key), does not exist. Creating it needs DNS, a certificate, and new secrets.

## 15. HIPAA

This repository does not implement HIPAA. It does not, and a later coding phase will not, make the organization compliant. Section 7 of the implementation plan lists controls the software can add and the obligations the software cannot satisfy (agreements, policies, risk analysis, training, and the rest).
