# Engage Sign - implementation baseline

Engage Sign is the first implementation milestone for Engage Support Services' internal document-signing workflow. It is intentionally built around the supplied nine-form baseline and a legal-evidence export.

## Working now

- A responsive staff dashboard for multi-signer progress, including partial completion such as “employee signed, awaiting trainer.”
- A mapped catalog for all nine supplied forms, with source SHA-256 hashes, source type, page count, field ownership, signer roles, and routing order.
- A data model for admins and staff, template versions, admin-fill and participant-fill fields, envelopes, ordered/parallel signers, immutable document versions, signature evidence, chained audit events, reminders/expiration, retention, and legal exports.
- A protected legal-export endpoint and UI. It creates a ZIP containing available source templates, prepared/presented/final documents, signer and field records, signature events, the audit chain, settings, a manifest, and SHA-256 checksums.
- Export integrity guards: if a private-storage file is missing or its current hash differs from the recorded hash, the export stops rather than silently creating an incomplete package.
- A MySQL 8 production schema under `database/mysql/` and generated D1 migrations for the Sites preview.
- A standard Node/Next.js production runtime for GoDaddy that listens on GoDaddy's assigned port, plus a one-time administrator setup, staff login, database-backed 12-hour sessions, login throttling, same-origin request protection, server-side `admin`/`staff` checks, account disablement, administrator-managed password resets, and authentication audit events.
- An administrator user-management screen. Complete legal exports are enforced as administrator-only on the server.
- An administrator template workspace for exact-baseline import, private storage, SHA-256 verification, signer field mapping, scanned-PDF coordinates, test fills, and version activation/retirement/rollback. Imported source files and rendered previews remain administrator-only.

For the exact GoDaddy setup sequence, see [`docs/GODADDY_DEPLOYMENT.md`](docs/GODADDY_DEPLOYMENT.md).

## Form mapping decisions

- The three supplied PDFs are flat scans without AcroForm fields, so they use coordinate overlays.
- The six Word files do not contain usable merge fields, so placeholders and assigned signer fields must be introduced as mapped template versions.
- Most forms use two signers. The application/background authorization is one applicant with two signature events. The competency checklist is evaluator-driven and supports an optional second RN evaluator.
- The CA and FHP contractor agreements remain in review because their source wording contains apparent inconsistencies. The implementation does not silently alter legal text.

## Security and deployment boundary

The default runtime is now the GoDaddy/Node deployment and uses MySQL plus storage outside the public web root. The earlier Sites/Cloudflare developer commands remain available under the `sites:*` scripts. Sensitive values are modeled as encrypted ciphertext with a key-version field; encryption keys must live outside the database.

The dashboard and legal-export endpoint require an application-owned staff session. Provision users explicitly; only administrators can create/disable users, reset staff passwords, or run the complete legal export. Public recipients will use a separate one-time signing-token flow; never give recipients staff accounts.

## Implementation to-do

Do not use the system for real signatures or sensitive participant data until the release-gate checklist at the end is complete.

### 1. Legal and workflow decisions

- [ ] Have counsel approve the electronic-signature consent text, signer attribution language, audit certificate, retention policy, and legal-export format.
- [ ] Resolve the apparent title wording in the CA contractor agreement.
- [ ] Resolve the conflicting written/numeric compensation and duplicate section in the FHP contractor agreement.
- [ ] Confirm which forms use ordered signing and which allow parallel signing.
- [ ] Confirm whether the optional second RN evaluator on the competency checklist can sign in parallel.
- [ ] Choose the production URL, preferably `sign.engagess.co`, and document the DNS/SSL owner.

### 2. Production authentication and roles

- [x] Add staff login for the GoDaddy/Node deployment with secure server-side sessions.
- [x] Provision the first administrator explicitly; never auto-promote the first visitor.
- [x] Enforce the two roles server-side: `admin` and `staff`.
- [ ] Restrict users, templates, retention policy, defaults, and full legal exports to administrators.
- [ ] Add self-service password reset email or SSO. Administrator-managed resets are implemented.
- [x] Add account disablement, session expiration, same-origin CSRF protection, login throttling, and audit events for authentication changes.
- [x] Add an administrator user-management screen.

### 3. Database and private file storage

- [x] Connect the Node application to MySQL 8 using `database/mysql/schema.sql`.
- [ ] Add migration execution and rollback procedures for production releases.
- [ ] Create private storage outside the public web root for templates, prepared PDFs, signatures, final PDFs, and audit certificates.
- [ ] Add a storage adapter so development can use R2/local storage while production uses the approved private GoDaddy path or object store.
- [ ] Encrypt sensitive database values with authenticated encryption and keep encryption keys outside MySQL.
- [ ] Implement encryption-key versioning and a tested rotation procedure.
- [ ] Set restrictive filesystem permissions and verify that stored files cannot be fetched by guessing a URL.
- [ ] Add automatic database and file-storage backups plus a documented restore drill.

### 4. Template import and field mapping

- [x] Add an administrator workflow to upload DOCX and PDF templates to private storage.
- [x] Verify and record a SHA-256 hash whenever a template version is uploaded.
- [x] Generate draft merge-placeholder revisions for the six Word templates, preserving the exact baseline files.
- [ ] Convert populated Word revisions to PDF on the deployment host and visually approve the results.
- [x] Build a coordinate mapper for scanned PDFs.
- [x] Support `admin-fill`, `participant-fill`, `signer`, and `system` fields.
- [x] Assign every generated Word placeholder and scanned-PDF overlay field to a signer role in draft field maps.
- [x] Add administrator-only source/PDF preview, PDF test-fill, version activation, version retirement, and rollback controls.
- [ ] Configure and verify DOCX-to-PDF conversion on the deployment host for Word preview and test-fill.
- [ ] Import and validate all nine baseline source files against the hashes in `lib/template-catalog.ts`.

The nine source files are kept outside this repository in the sibling `engage docs` folder. All nine local SHA-256 hashes match the catalog. The repository script generates six private draft DOCX revisions and role-assigned JSON maps under ignored `work/revised/`; the three scanned PDFs have role-assigned draft coordinate maps. These files have **not** been imported into GoDaddy private storage, and no version has been activated. The first upload for each catalog entry must match its recorded baseline hash. A headless LibreOffice binary is still required on the application host to render Word previews and test PDFs. See [`docs/TEMPLATE_WORKFLOW.md`](docs/TEMPLATE_WORKFLOW.md).

### 5. Document sending and signer routing

- [ ] Build the send-document form with template selection, admin fields, recipients, routing order, expiration, and reminder overrides.
- [ ] Generate a separate cryptographically random token for each document/signer pair.
- [ ] Store only token hashes, enforce expiration, and invalidate each token after successful signing.
- [ ] Exchange URL tokens for short-lived secure cookies so tokens do not remain in browser history or analytics.
- [ ] Support ordered and parallel signers, including optional signer roles.
- [ ] Track draft, sent, viewed, partially signed, completed, declined, expired, and voided statuses.
- [ ] Prevent edits to the document version or assigned fields after the first signer receives it.

### 6. Recipient signing experience

- [ ] Build the public signing page with no staff account requirement.
- [ ] Show the exact document being signed and require explicit electronic-signature consent.
- [ ] Support typed and drawn signatures plus initials and assigned participant fields.
- [ ] Validate required fields and provide an accessible review-before-submit step.
- [ ] Capture the UTC timestamp, IP address, user agent, consent version, signature method, signer identity, and hash of the exact presented PDF.
- [ ] Encrypt IP addresses and other sensitive evidence fields at rest.
- [ ] Make signing submission idempotent and reject expired, voided, reused, or mismatched tokens.
- [ ] Notify the next signer only after the prior required signer completes when routing is ordered.

### 7. PDF and evidence generation

- [ ] Render admin fields into an immutable prepared PDF before sending.
- [ ] Save the hash of every prepared, presented, intermediate, and final document version.
- [ ] Bake signatures and signer-entered fields into the final PDF.
- [ ] Add a readable audit block or separate certificate showing all signer events and document hashes.
- [ ] Generate the final archive only after all required signers have completed.
- [ ] Store the final PDF checksum separately; do not try to embed a file's own checksum inside itself.
- [ ] Add independent checksum verification and regression tests for every PDF-generation path.

### 8. Outlook SMTP and email delivery

- [ ] Add a production mail adapter, initially using the approved Outlook/Microsoft 365 SMTP account.
- [ ] Store SMTP host, port, username, credential or OAuth configuration, sender address, and reply-to address in environment secrets - never in Git.
- [ ] Require encrypted transport and reject invalid certificates.
- [ ] Create branded templates for initial signing requests, next-signer notifications, reminders, completion notices, expiration, decline, and void events.
- [ ] Keep signing tokens out of email logs and application error messages.
- [ ] Record message type, recipient reference, send time, provider response, retry count, and final delivery status in the audit trail.
- [ ] Add retry/backoff behavior and an administrator view for failed messages.
- [ ] Verify the sender domain's SPF, DKIM, and DMARC configuration before production use.

### 9. Scheduled jobs

- [ ] Add a daily scheduled job for reminders and unsigned-document expiration.
- [ ] Make reminders idempotent so the same reminder is never sent twice.
- [ ] Lock signing links immediately when an envelope expires or is voided.
- [ ] Implement the retention job with `NULL = keep forever`.
- [ ] Require an administrator-configured retention period before any purge is possible.
- [ ] Add a dry-run report, audit event, and backup/export check before destructive retention purges.
- [ ] Document the GoDaddy cron command and timezone.

### 10. Legal archive and operational backups

- [x] Generate a legal ZIP containing records, audit events, available documents, a manifest, and SHA-256 checksums.
- [x] Stop the export if a stored file is missing or its checksum has changed.
- [x] Record the complete ZIP checksum separately from the archive contents.
- [ ] Add date-range and document-specific export scopes while keeping complete-export support.
- [ ] Add optional client-side or server-side archive encryption with a separately delivered passphrase.
- [ ] Store export history and provide a verification screen for previously exported archives.
- [ ] Test restoring MySQL and private files independently from the legal archive.

### 11. Security and privacy hardening

- [ ] Enforce HTTPS and secure, HTTP-only, same-site cookies in production.
- [ ] Add security headers, request-size limits, rate limits, input validation, and upload-type validation.
- [ ] Keep personal data, tokens, signatures, and document contents out of routine logs and analytics.
- [ ] Add malware scanning or a quarantine process for uploaded templates.
- [ ] Add dependency and secret scanning to GitHub.
- [ ] Review access to the sensitive background-authorization fields, especially SSN and date of birth.
- [ ] Complete a threat model covering token theft, account takeover, replay, document substitution, insider access, and backup exposure.
- [ ] Run a production security review before enabling external signing links.

### 12. Testing, monitoring, and release

- [ ] Add unit tests for token hashing, audit-chain hashing, encryption, status transitions, reminders, retention, and archive verification.
- [ ] Add integration tests for MySQL, storage, email, and PDF generation.
- [ ] Add end-to-end tests for one-signer, ordered two-signer, parallel signer, optional evaluator, expired link, decline, and void flows.
- [ ] Add accessibility testing for keyboard-only signing and screen readers.
- [ ] Add monitoring for failed jobs, failed email, storage errors, audit-chain failures, and repeated invalid-token attempts.
- [ ] Add health checks, structured redacted logs, alerting, and administrator runbooks.
- [ ] Configure separate development, staging, and production environments with separate databases, storage, credentials, and sender addresses.
- [ ] Complete a staging signing exercise and archive-verification drill before production launch.

### Production release gate

- [ ] Legal language and source agreements approved.
- [ ] All nine templates imported, mapped, and visually verified.
- [ ] Authentication, role enforcement, encryption, private storage, SMTP, and scheduled jobs configured.
- [ ] All required automated tests pass in GitHub Actions.
- [ ] Backup restore and legal-archive verification drills pass.
- [ ] Security review has no unresolved critical or high-risk findings.
- [ ] A named administrator and operational owner approve production activation.

## Run locally

```bash
npm install
npm run dev
```

The default local runtime is the same Next.js/Node path used by GoDaddy. Copy `.env.example` to `.env.local`, configure a development MySQL database, import `database/mysql/schema.sql`, and then open `/setup`. Generate a D1 migration for the optional Sites runtime with `npm run db:generate`; verify a GoDaddy release with `npm run build`.

The optional prior Sites preview can still be run with `npm run sites:dev` and built with `npm run sites:build`.

## Development workflow

1. Create a feature branch from `main`.
2. Make and test one scoped change.
3. Run `npm run format`, `npm run lint`, and `npm run build`.
4. Open a pull request and require the GitHub Actions checks to pass.
5. Merge only after review; deploy staging before production.
