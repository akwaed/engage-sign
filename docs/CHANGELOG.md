# Changelog

Release stack on top of `prod-baseline-20260930` (production release 20260930-consent). No production deploy is included.

## Migrations

Apply with a privileged database account before restarting the new build:

1. `004_auth_rbac.sql` — roles, `can_publish`, setup flag, rate limits, account mail rows
2. `005_document_dashboard.sql` — signer email blind index
3. `006_template_editor.sql` — field types, PDF-point coordinates, immutability triggers
4. `007_signing_verification.sql` — `verification_method` default `email_link`
5. `008_security_controls.sql` — audit HMAC payload columns, no cascade delete, retention purge flag default off

001 through 003 were already applied on the production baseline.

## Phase 2 — accounts

Password reset, invites, rate limits, role checks, and a staging file mailbox. CI runs `npm test`.

## Phase 3 — documents

Personal and admin document history, search that uses the email blind index, and permission-checked downloads of the completed PDF and audit certificate.

## Phase 4 — template editor

Visual PDF editor, new templates outside the nine catalog slugs, and published-version immutability.

## Phase 5 — TB-4

Official blank Kentucky TB-4 (3/2014) as an opt-in seeded template, a four-step signer flow, and fictional samples in `docs/samples/`.

## Phase 6 — security controls

HMAC audit verification, richer audit certificates, CSP, optional AES-256-GCM for PDFs, idle timeout, and retention settings with deletion left off.

## Phase 7 — these notes

Operator docs for accounts, the editor, versioning, SMTP, deploy, and rollback.

## Files changed since the production baseline

`.env.example`, `.github/workflows/ci.yml`, `instrumentation.ts`, `next.config.ts`, `package.json`, `package-lock.json`, `database/mysql/schema.sql`, migrations 004–008, the app routes and pages under `app/admin`, `app/api`, `app/documents`, `app/forgot`, `app/login`, `app/reset`, `app/setup`, `app/sign`, `app/s`, `app/page.tsx`, components for sending, templates, and the TB wizard, `lib/**` modules listed in the phase commits, `scripts/vps/jobs.ts`, `scripts/vps/seed-tb-template.ts`, `scripts/vps/encrypt-private-files.ts`, the tests named in CI, `fixtures/templates/ky-dph-tb-4.pdf`, and the docs and samples added in Phases 5–7.
