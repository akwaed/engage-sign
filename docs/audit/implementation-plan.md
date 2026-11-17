# Implementation plan (phases 2–8)

This plan follows the Phase 1 audit in `docs/audit/phase1-repo-audit.md`. It extends the application that is already in git. It does not replace sign-in, the scrypt password format, session cookies, or the nodemailer SMTP basic-auth client.

No application code is part of the Phase 1 pull request. Do not start Phase 2 against production until the VPS snapshot has been diffed (gate below).

## Rules for every phase

- Schema changes are new files under `database/mysql/migrations/`, numbered after `003`. Each script is additive: `ADD COLUMN`, new tables, new indexes, new enum values that keep every existing value. No `DROP TABLE`, no `DROP COLUMN`, no `DELETE` of user or audit rows, no rewrite of `password_hash`.
- Do not re-import `database/mysql/schema.sql` into a database that already has rows. On GoDaddy, Import SQL is documented as dropping tables first. On the VPS, apply migrations with the `mysql` client against a backup.
- Expand, then deploy code that understands the new columns, then backfill. A rollback of the Node process must still boot if the new columns exist. Avoid a code release that requires a down migration.
- Secrets stay in the host environment. Names already in `.env.example` stay the names. New secrets (`AUDIT_HMAC_KEY`, and later an OTP pepper if one is added) go in `.env.example` as empty assignments and in the host secret store. No values in git.
- Keep `APP_URL=https://sign.engagess.co` with no trailing slash, cookie name `engage_sign_session`, and hash prefix `scrypt-v1`.
- Keep Node `>=22.13.0`, `npm run build` (`next build --webpack`), and `npm start` (`next start` on `PORT`).
- Patient and signer fixtures are fictional. The signed TB PDF is not a fixture.
- Do not describe the result as HIPAA compliant. Use the gap list in Phase 7 when talking to the owner.

## Gate before Phase 2: match the VPS to git

`origin/codex/signing-workflow` (`90fc2df`) is `main` (`e062648`) plus the template and signing work. Auth files match. SMTP exists only on the branch, as nodemailer basic auth (`SMTP_USER` / `SMTP_PASSWORD`, STARTTLS on 587, TLS on 465, certificate verification on).

When the production snapshot arrives:

1. Diff it to `e062648` and to `90fc2df`. Record the commit or the file-level drift in `docs/audit/` (a short addendum, not a new product).
2. If production matches `90fc2df`, base the feature branches on that branch and merge it only through review. Do not reimplement `lib/signing-mail.ts`, `lib/encryption.ts`, `lib/private-storage.ts`, `lib/auth/*`, or the recipient cookie exchange.
3. If production matches `main` but SMTP works on the VPS, the mailer is outside this repo (local relay, or a file that was never pushed). Find that path before editing mail. Prefer adopting the branch's nodemailer client over writing a third sender, and keep basic auth.
4. If production matches neither, list the drift and reconcile before any migration. Do not assume the September 2026 GoDaddy notes still describe the host. Those notes reported `EACCES` to `smtp.office365.com:587` and an unpublished app. The owner now reports a working VPS. Trust the snapshot.

Also record, from the VPS audit rather than from guesswork: the process manager, the TLS terminator, whether `X-Forwarded-*` headers are overwritten, `NODE_ENV`, the real `PRIVATE_STORAGE_PATH`, and whether Preview and production share a database. The repo cannot answer those.

## Phase 2 — Auth and user management

Goal: administrator and self-service password reset, an account dashboard, and server-enforced roles. External signers still have no account.

### Keep

- `hashPassword` / `verifyPassword` and the `scrypt-v1` string. New passwords use the same function. A later Argon2id option would be a second verifier that runs only after a successful login and writes a new hash; it is not required for this phase and must not invalidate current passwords.
- Session creation, SHA-256 token storage, 12-hour absolute lifetime, revocation on logout, disable, and password change.
- Setup lock and `SETUP_TOKEN` behavior. Remove `SETUP_TOKEN` from the environment after the first administrator exists (already the documented step).
- Same-origin checks on every new POST.

### Roles

Do not drop `admin` or `staff` from the enum. Add values and a permission table so existing rows remain valid.

Suggested additive shape:

- `ALTER TABLE users MODIFY role ENUM('admin','staff','template_manager','standard_user')` so old values still load. Treat existing `admin` as Administrator. Treat existing `staff` as Standard User for authorization decisions, and leave the stored role as `staff` until an administrator explicitly changes it. That avoids a surprise privilege change: today `staff` cannot send documents.
- New table `user_permissions (user_id, permission, granted_at, granted_by)` with a unique pair. Permission strings: `users.manage`, `templates.edit`, `templates.publish`, `documents.send`, `documents.read_all`, `exports.run`.
- Seed, in the migration, `users.manage`, `templates.edit`, `templates.publish`, `documents.send`, `documents.read_all`, and `exports.run` for every current `admin`. Seed `documents.send` for current `staff` only when the owner confirms they should become Standard Users. Until that confirmation, staff keep today's access (sign in, no send).
- Authorization helper, used by every route that currently checks `role !== 'admin'`: `requirePermission(user, permission)`. UI hiding is not the control.

Role behavior:

| Role                      | Account | Can do                                                                                                                                        |
| ------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator             | yes     | All permissions, including user admin and legal export.                                                                                       |
| Template Manager          | yes     | Create, edit, preview, and duplicate templates. Publish only with `templates.publish`. Send documents and see own history (`documents.send`). |
| Standard User             | yes     | Send published templates and see own documents. Cannot edit templates or other people's documents.                                            |
| Patient / external signer | no      | Invitation link only. No `users` row, no staff session.                                                                                       |

Publishing is `template_versions.lifecycle` moving from `draft` to `active`, which already retires the previous active version. Gate that action on `templates.publish` instead of `role === 'admin'`.

### Password reset

Use the existing `password_reset_tokens` table.

- Token: `randomBytes(32)` base64url. Store SHA-256 hex only. Expiry 30 minutes (column `expires_at`). Single use via `used_at`.
- Requesting a new token sets `used_at` on older unused rows for that user inside the same transaction.
- Self-service: user enters email. Always answer with the same generic page. If the account is active, enqueue a reset mail (Phase 6 transport). Do not reveal whether the email exists.
- Administrator-initiated reset: from the user dashboard, creates the same kind of token and enqueues the same mail. Remove the form that accepts a temporary password as the normal path. Keep the scrypt setter only as a break-glass script outside the app, or behind an extra confirmation that still revokes sessions. Do not email a plaintext password.
- On success: update `password_hash` and `password_changed_at`, set `used_at`, set `failed_login_count = 0`, clear `locked_until`, revoke every `staff_sessions` row for that user, write audit events `PASSWORD_RESET_COMPLETED`.
- Rate limit: per account and per IP, on both the request and the submit. Reuse the lockout style already on `users` for password guesses, and add a small `auth_rate_limits` table `(bucket, window_start, count)` for IP and email hashes so limits survive restarts. Suggested ceiling: 5 reset requests per email per hour, 20 per IP per hour, 5 submit attempts per token.
- Audit, without the token or the new password: `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_REJECTED`, `STAFF_LOGIN_FAILED` (add this; it is missing today), `STAFF_USER_INVITED`, `STAFF_ROLE_CHANGED`, `STAFF_SESSIONS_REVOKED`.

### Administrator dashboard

Extend `/admin/users` rather than a new app. Server checks `users.manage` on the page and on `POST /api/admin/users`.

- Create and invite: name, email, role, optional permission ticks (publish is off unless chosen). Creating a user does not display a password. It writes an invite token in `password_reset_tokens` and sends the reset/invite mail so the person sets their own password.
- Search by name and email, filter by role and status, paginate.
- Activate and deactivate. Deactivate revokes sessions (already implemented for disable). Keep the last-active-administrator guard.
- Start a reset (above).
- Activity: last login from `STAFF_LOGIN_SUCCEEDED`, recent audit rows for that `actor_id`, and current sessions (`created_at`, `last_seen_at`, `expires_at`, hashed IP only). Button to revoke one session or all sessions.
- Role change writes `STAFF_ROLE_CHANGED` and revokes sessions so an old cookie cannot keep a higher privilege.

### Hardening in this phase

- Set staff cookie `Secure` when the public origin is HTTPS, matching the recipient cookie on the signing branch. Keep `HttpOnly` and `SameSite=Lax`.
- Stop trusting `X-Forwarded-Host` unless a new env flag `TRUST_PROXY=1` is set and the VPS proxy overwrites those headers. Otherwise compare `Origin` to `APP_URL`.
- Tighten `safeReturnTo` to reject backslashes and encoded scheme-relative paths.
- Delete or isolate `app/chatgpt-auth.ts` so it cannot become a login path. Prefer deleting the unused module in this phase; it is not part of working sign-in.
- Do not change the login POST shape, the cookie name, or the scrypt parameters.

## Phase 3 — Document dashboard

Build this on `envelopes`, `signers`, `template_versions`, and `templates`. Do not add a second document table. The signing branch already has `/admin/documents/[id]`, `/admin/send`, and a live home query. Replace the unscoped query. On `main`, the home page fixtures get replaced by this query when the signing branch is the base; they are not a data source.

### Own history

For a user without `documents.read_all`:

`WHERE envelopes.created_by = ?`

Columns: document title, template name, template version number, recipient display name (decrypted only for rows the user may see), sent / viewed / completed timestamps, status, actions.

Status labels. Store the existing enum. Display names:

| Stored                                                              | Shown                                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `draft`                                                             | Draft                                                                             |
| `sent`                                                              | Sent                                                                              |
| `viewed`                                                            | Viewed                                                                            |
| `partially_signed`                                                  | Viewed or Sent, with a "partially signed" progress note. Do not collapse history. |
| `completed`                                                         | Completed                                                                         |
| `declined`                                                          | Declined                                                                          |
| `expired`                                                           | Expired                                                                           |
| `voided`                                                            | Canceled                                                                          |
| outbox invite `failed` after the last retry, envelope not completed | Failed                                                                            |

Adding a new stored status is optional. Prefer deriving Failed from `notification_outbox` so existing rows do not need an update. If a stored `failed` value is added, it is a new enum member, not a replacement.

Dates: `envelopes.created_at` (sent when status leaves draft), `signers.viewed_at`, `signers.signed_at`, `envelopes.completed_at`. All rendered in UTC with a zone label.

Search (title, template name, recipient), filters (status, template, date range), sort, and pagination (keyset or `LIMIT/OFFSET` with a hard cap, for example 50). Recipient search needs a lookup key because ciphertext is not searchable: add `signers.email_lookup CHAR(64)` as HMAC-SHA256 of the normalized email with `IP_HASH_SECRET` or a dedicated `LOOKUP_HMAC_KEY`. Do not store a raw email for search. Backfill is not possible for old rows without the encryption key; new and in-flight drafts get the HMAC at write time. Old rows remain findable by title and date.

### Administrator organization view

Permission `documents.read_all`. Same table plus filters for employee (`created_by`), recipient, template, status, and date. Staff and template managers do not get this view.

### Downloads

`GET` routes for the final PDF and the audit certificate, both streaming from `readPrivateObject`. Authorize when `created_by` matches or the caller has `documents.read_all`. Refuse unless status is `completed` and the stored SHA-256 matches the bytes. Write `DOCUMENT_DOWNLOADED` with the user id, document id, and hash. `Cache-Control: private, no-store`. The signing branch's admin archive route is the place to add this check; do not add a public file URL.

The home page must not call `expireDueEnvelopes()` as a side effect of a read. Expiration belongs in the scheduled job (Phase 6).

## Phase 4 — Visual template editor

Extend `components/template-manager.tsx`, `lib/template-files.ts`, and `template_fields`. Keep pdf.js for the preview and `pdf-lib` for the flattened export. Keep the draft / active / retired lifecycle and the rule that a sent envelope stores `template_version_id`.

### Catalog

The nine baseline forms stay hash-checked. Add a path that creates a template without a catalog slug: PDF upload only for the TB work and later clinical forms. DOCX remains available for the existing employment forms and still needs `LIBREOFFICE_BIN` on the host. Do not block PDF templates on LibreOffice.

Upload checks to keep and extend: `%PDF-` magic, `pdf-lib` parse with encryption rejected, size cap (20 MB is already the cap; also cap page count, for example 30), and reject files with JavaScript or embedded files. Store under the existing private-key layout. Record SHA-256 on the version row, which already has `source_hash`.

### Editor

On the pdf.js canvas, for draft versions only:

- Drag to move, handles to resize, multi-page with the existing page control.
- Zoom that scales the viewport and converts pointer positions back to the 0–1000 grid (the grid is already what `fillPdf` uses).
- Alignment: snap to other boxes' edges and to page center. Optional, but the coordinates must stay in the same grid.
- Keyboard: arrow keys nudge the selected field, Shift for larger steps, Delete removes it, focus order matches `display_order`.
- Required toggle, recipient role from the template's signer plan.
- Preview as signer: render only that role's fields and the flattened PDF, using the same `fillPdf` function as send.

Field types. Existing enum: `text`, `date`, `checkbox`, `radio`, `initials`, `signature`. Add `multiline`, `dropdown`, `email`, `phone` with `ALTER TABLE ... MODIFY field_type ENUM(...)` including every old value. Add nullable `options_json` for dropdown choices and `group_key` for radio groups. Checkbox groups for "check all that apply" are independent checkbox fields, not a single value.

Export accuracy:

- Multiline wraps inside the box with the same font metrics the server uses. Do not clip silently; validation shows an overflow warning in the editor.
- Checkbox and radio draw a consistent mark in the box, not a text `X` that ignores the box height.
- Date, email, and phone are validated text with formats fixed by the field type.
- Signature and initials reserve a box. Drawn signatures use the existing PNG embed. Typed signatures use the existing text path.
- The signer must not be able to move fields. The sender must not be able to change labels, coordinates, or wording on a sent envelope. Admin-fill values, where a template still has them, are data, not a license to edit the PDF text. For the TB template, patient demographics are signer or sender values in mapped boxes; question text is part of the immutable PDF.

### Versions

- Drafts are editable by `templates.edit`.
- Publish (`templates.publish`) sets `lifecycle = 'active'`, sets `activated_at`, and retires the previous active version. After that, `map` rejects the version (already true for non-drafts).
- A change to a published template is "duplicate" or "new version": copy the PDF bytes and field rows into a new `version_number` in `draft`. The active row is untouched.
- Send continues to require `lifecycle = 'active'` and keeps `template_version_id` on the envelope. Rollback of which version is active may exist for administrators and must not rewrite envelopes already sent.
- Audit: `TEMPLATE_VERSION_UPLOADED`, `TEMPLATE_FIELDS_MAPPED`, `TEMPLATE_VERSION_ACTIVATED`, `TEMPLATE_VERSION_DUPLICATED`.

## Phase 5 — TB risk-assessment trial template

The attached file is a one-page scan of a completed Kentucky Department for Public Health TB risk assessment, with a real person's handwriting and signature. It is not a template source.

1. Obtain the current blank from the Kentucky Department for Public Health (the public form, not a photocopy of a completed chart). Record the form's official name, revision date, and SHA-256 in the template version row.
2. If the agency cannot supply a blank file, rebuild a clean one-page PDF that preserves the official questions and layout, using the public form as the source. Do not start from the signed scan, and do not paint over it. A rebuilt page is a new document and should be reviewed against the official form before publish.
3. Do not commit either PDF. Upload goes to `PRIVATE_STORAGE_PATH` through the Phase 4 importer. Tests generate a tiny synthetic PDF with the same field names, not the official scan.
4. Interactive fields only:
   - Top of form: patient name, date of birth, address, phone, and email, as the blank form labels them.
   - Section II-A checkboxes: multi-select, none required to be exclusive, no score.
   - Section II-B checkboxes: same.
   - Consent statement (the counsel-approved text, versioned), signature (draw or type), and date.
5. Every other clinical line, including symptom screens and any interpretation language, stays non-interactive ink in the PDF. The application must not compute a risk level, diagnosis, or "skip to" recommendation. Skipping is instructions printed on the form, not code.
6. One recipient role, `patient`, external, no account. Sender is a Standard User or Template Manager using the published version. The sender cannot edit questions per patient.
7. Mark this template `email_disclosure = 'generic'` (Phase 6) so notification mail does not include the title or any field value.

Fictional data for trials: invented names and non-routable example addresses. No production database rows from the signed form.

## Phase 6 — Email signing without accounts

Extend `lib/signing-domain.ts`, `app/s/[token]/route.ts`, `lib/recipient-session.ts`, `lib/signing-mail.ts`, and `notification_outbox`. Do not add a second token scheme.

### Tokens

Already true in code, and required to stay true:

- CSPRNG `randomBytes(32)`, stored as SHA-256, unique, bound to one signer row (document + recipient).
- Expiry from the envelope (`expires_at`), chosen at send time, default 14 days from `system_settings`.
- Invalid after completion (`token_used_at`, status not `sent`/`viewed`). Also revoke `signer_sessions` on complete, decline, cancel, and expire.
- URL path is `/s/<token>` and then a redirect to `/sign/<uuid>`. Neither path contains a name, email, diagnosis, or document title. Proxy access logs should not record the raw `/s/` path; that is a VPS config item (log the route pattern, not the parameter). `Referrer-Policy: no-referrer` stays on the exchange response.
- Move the token-hash update into the same transaction as a successful send, or mint the token only after SMTP accepts, so a failed attempt does not rotate the hash that a later retry needs. Today the hash is replaced before `sendMail`. Fix that without changing the hash algorithm.
- Add `signers.verification_method VARCHAR(32) NOT NULL DEFAULT 'email_link'`. Future email OTP sets `email_otp` and still requires the link. Do not build OTP in this phase; do not put a one-time code in the URL.

`GET /s/[token]` will keep exchanging the token for a cookie, because mail clients prefetch links. It must not mark the token used. It should stop inserting a new presented-document row on every prefetch: reuse the latest prepared hash if one is already stored for that signer. Session cookies stay `HttpOnly`, `SameSite=Strict`, 30 minutes, `Secure` on HTTPS.

### Messages

Send only through the existing nodemailer transporter and outbox. Basic auth, `requireTLS`, `rejectUnauthorized`, ports 587 and 465. No OAuth.

| Event                      | Outbox type             | Recipient                                                                                                                                                                                                  |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invite / signature request | `invite`, `next_signer` | signer                                                                                                                                                                                                     |
| Reminder                   | `reminder_<day>`        | signer who has not finished                                                                                                                                                                                |
| Completed                  | `completion`            | signer and sending user                                                                                                                                                                                    |
| Expired                    | `expiration`            | signer and sending user                                                                                                                                                                                    |
| Canceled (`voided`)        | `void`                  | signer and sending user                                                                                                                                                                                    |
| Password reset / invite    | `password_reset`        | staff user (new type; not tied to a signer row, so either a nullable `signer_id` or a sibling `user_notifications` table). Prefer a new `user_notifications` table so the signer foreign key stays intact. |

Default body for templates with `email_disclosure = 'generic'` (the TB template, and any future clinical template): organization name, a generic sentence ("a document is ready for you"), the link or reset link, and the expiry in UTC. No patient name, no form title, no field values, no PDF, no medical detail. Employment templates may set `email_disclosure = 'title_ok'` after a human review; that flag is per template version and is copied onto the envelope at send so a later template edit cannot change what an old email would have said. Existing nine catalog forms stay `title_ok` only if someone confirms the title is not clinical. Medication forms should be `generic`.

Completion mail continues to say the document is complete and that the sender can provide the copy. It does not attach the PDF.

Scheduler: a host cron or systemd timer hitting an authenticated local command or `POST /api/admin/mail` action `run` is an ops step documented after the VPS snapshot. The app function already expires, queues reminders, and dispatches. The timer must be idempotent (the outbox unique key already is). Do not send reminders from the dashboard GET.

SPF, DKIM, and DMARC are DNS work for the owner, not application code. The September notes said DKIM and DMARC were missing. Re-check on the live domain before clinical mail, and do not weaken TLS to get past a block.

## Phase 7 — Security and evidence

### Application controls

- HTTPS: confirm the VPS terminates TLS for `sign.engagess.co` and redirects HTTP. Keep the HSTS header already in `next.config.ts`. The app does not terminate TLS itself.
- Encryption at rest, application layer: keep AES-256-GCM and `ENCRYPTION_KEY_V1` for signer identity, field values, signature images, and signature IP/user-agent. Document that this does not encrypt the whole database. Envelope titles, template PDFs, and final PDFs are protected by private directory permissions and, if the VPS provides it, full-disk encryption (LUKS or the provider's volume encryption). Record what the VPS actually has. Do not claim disk encryption the snapshot does not show. Key loss makes ciphertext unreadable; the key stays in the host secret store and in the owner's offline backup, not in git or in MySQL.
- Private storage: keep the path checks, `0700`/`0600`, and symlink refusal. Web server root must not include that directory. Add a regression test that a `../` key throws.
- CSRF: Phase 2 proxy fix, `SameSite`, and same-origin. Add a synchronizer token for cookie-authenticated POSTs if the VPS will host any same-site companion app. Not a replacement for the origin check.
- XSS: add a Content-Security-Policy that allows the app origin and the pdf.js worker, and disallows object embeds and inline event handlers. Keep `X-Frame-Options: DENY` and `nosniff`.
- Uploads: Phase 4 checks. Do not accept the signed TB scan.
- Injection: keep parameterized SQL. Validate enum-like fields against allow-lists (already the pattern for roles and actions).
- Rate limits: Phase 2 table, also applied to `/s/[token]`, signing POST, and mail `run`.
- Sessions: revocation list stays in `staff_sessions.revoked_at`. Password change and role change revoke all sessions for that user.

### Audit chain

Keep `appendAuditEvent` and the triggers. Changes, all additive:

- Add `audit_events.seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE` so order does not depend on the clock. New code links `previous_hash` to the highest `seq`, not to `ORDER BY occurred_at, id`.
- New environment secret `AUDIT_HMAC_KEY`. New events store HMAC-SHA256 (key, canonical JSON) in `event_hash`. Old rows stay SHA-256. The verifier accepts a row if either calculation matches and the stored `previous_hash` matches the prior row. Do not recompute historical rows.
- Include the signature-event id and the final PDF SHA-256 in the `DOCUMENT_SIGNED` details so the chain covers the evidence row.
- Change `audit_events` foreign key from `ON DELETE CASCADE` to `ON DELETE RESTRICT` in a migration. That does not delete data. It stops envelope deletion from erasing the log. Do not add a delete-envelope feature.
- Add the same `BEFORE UPDATE` trigger pattern to `signature_events` if the column set is complete at insert. If later code must set a nullable column, add that column as nullable before the trigger, and write it on insert.
- A read-only `verifyAuditChain()` used by tests and by the certificate builder. It does not "repair" rows.
- UTC everywhere, already the case. Certificate shows UTC.
- IP and user agent: keep the encrypted copies on `signature_events`. Stop putting raw emails in `details_json`.
- Final PDF SHA-256 remains `document_versions.document_hash` for `version_kind = 'final'`. The certificate PDF (existing `lib/final-archive.ts` evidence page and ZIP) lists each signer event, verification method `email_link`, UTC time, and the final hash. Administrators and the sending user can download it under the Phase 3 rule. The certificate's own hash is stored beside the PDF hash (`final_archives` already has separate columns). Do not embed a file's hash inside itself.

### What the software cannot make true

These stay outside the codebase. Completing Phases 2–8 does not close them.

- Business associate agreements and subcontractor agreements (hosting, MySQL, Microsoft 365, backups, any conversion service).
- Privacy and security policies, sanction policy, and a named privacy and security officer.
- Enterprise risk analysis and risk management plan.
- Workforce training and access authorization procedures.
- Facility, workstation, and device controls; media disposal.
- A breach-notification process and incident log.
- Contingency plan, backup restore drills, and emergency access procedure. The app can document a backup command; it cannot perform the drill.
- Evaluation of the hosting provider, disk encryption, and whether Preview shares the production database.
- Minimum-necessary policy for who may be an Administrator. The app can enforce the role; it cannot decide who should have it.
- Counsel review of the consent sentence. The current string is explicitly unapproved.

Say "controls implemented in the application" and "gaps that remain organizational." Do not say "HIPAA compliant."

## Phase 8 — Tests

Runner: the signing branch's `node --experimental-strip-types --test`. Add `npm test` to CI after `npm run lint` and before `npm run build`. Use fictional factories. No network, no real SMTP, no signed TB file.

| Area         | Cases                                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | scrypt verify, wrong password, lockout on the 5th failure, disabled user, reset token hash is not the raw token, expired token, reused token, sessions revoked after reset.                                                 |
| RBAC         | Standard User denied `templates.publish`, `documents.read_all`, and user admin. Template Manager denied publish without the grant, allowed to edit drafts. External signer cookie cannot open `/admin/users`.               |
| Templates    | Active version rejects field updates. New version does not change the old `source_hash`. Envelope keeps its `template_version_id` after a newer version is published.                                                       |
| Signing      | Required field missing, field assigned to someone else rejected, token rejected after `token_used_at`, presented hash mismatch rejected, second identical submit returns the first result.                                  |
| Tokens       | 32 bytes, unique, only the hash written, lookup does not accept the hash as the token, `/s/` redirect location has no email or name.                                                                                        |
| Cross-user   | User A cannot read or download user B's envelope by id. The list query returns only `created_by = A`.                                                                                                                       |
| Uploads      | Non-PDF rejected, encrypted PDF rejected, oversized rejected, path escape rejected. A generated one-page PDF is accepted.                                                                                                   |
| Audit        | Insert two events, tamper with `details_json`, verifier fails. Delete of an envelope does not remove audit rows after the foreign-key change.                                                                               |
| TB rendering | Synthetic PDF plus the Phase 5 field map. II-A and II-B boxes can be checked in any combination. No code path emits a diagnosis string. Generic mail render contains neither the fictional patient name nor the form title. |

Database tests can run against MySQL in CI if a service container is acceptable. If not, keep pure unit tests in CI and document a local `mysql` import for integration tests. Do not point tests at production.

## Rollback

Before the first production migration of a phase:

1. `mysqldump` of the application database, stored outside git and outside the web root. Confirm the dump restores into an empty database on another instance.
2. Copy the current release directory (the `next build` output and the matching commit SHA) so the process manager can point back at it.
3. Apply the migration during a window where a failed statement can be restored from that dump. Scripts must be safe to read twice: guard `ADD COLUMN` with `information_schema` checks where MySQL would otherwise abort the whole file.
4. Deploy the new build. Smoke-test `/api/health`, `/login`, an existing user's password, and, once mail exists, the admin SMTP verify action that does not send a message.
5. If the new build fails and the migration only added nullable columns or tables, point the process manager at the previous build. Old code ignores unknown columns. Do not drop the new columns in a hurry.
6. If the migration itself fails or corrupts rows, restore the dump. Do not improvise `DELETE` statements. Then fix the script and try again on a copy.
7. SMTP secrets, `ENCRYPTION_KEY_V1`, and `AUDIT_HMAC_KEY` are not part of the rollback. Leave them in the environment. Rolling back the app must not rotate them.
8. A canceled phase does not require a down migration. Forward-fix in the next migration.

Write the exact dump command and the process-manager restart command into the deploy note only after the VPS snapshot shows how the service is supervised. The repository currently has neither.

## Suggested order of work

1. VPS snapshot diff (gate).
2. Phase 2 on top of the confirmed tree, including the mail enqueue for reset messages but not a new SMTP client.
3. Phase 6's generic templates and token-rotation fix, because Phase 2 invites need them. The rest of Phase 6 (reminders timer, disclosure flag) can land in the same release if the outbox is already on the server.
4. Phase 4 editor, then Phase 5 TB template on a blank PDF.
5. Phase 3 dashboard once envelopes exist on the confirmed tree.
6. Phase 7 chain and CSP alongside the tests that lock them in.
7. Phase 8 grows with each phase; the CI `npm test` switch happens with the first new test file, not at the end.

Each implementation phase is its own branch and pull request. Migrations from earlier phases stay applied.
