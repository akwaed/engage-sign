# Final report

Engage Sign was reviewed against the production release `20260930-consent` (`prod-baseline-20260930`) and extended on stacked branches. Production was not deployed and the VPS was not changed.

## What was already working

Next.js on Node 22 behind nginx, MySQL 8, scrypt passwords, httpOnly sessions, nodemailer to Office 365 on port 587 with STARTTLS basic auth, private file storage, and a hash-chained audit log. Signing links and the jobs timer were already in production.

## What was added

- Account recovery, invites, rate limits, and roles for admin, template manager (with a separate publish grant), and standard user. External signers stay on invitation links.
- A document dashboard with blind-index email search and checked downloads.
- A visual PDF template editor with immutable published versions.
- The public Kentucky TB-4 form as an opt-in template and a four-step signer flow. No scoring and no diagnosis. SSN is not collected.
- HMAC audit verification, a fuller audit certificate, CSP and related headers, optional encryption of template and final PDFs, a 30-minute idle timeout plus the 12-hour absolute session, and retention settings that do not delete anything.

## Tests

`npm test` on the Phase 6 commit passed 38 tests locally, including the fictional TB-4 completion. Samples:

- `docs/samples/ky-tb-4-completed.pdf`
- `docs/samples/ky-tb-4-audit-certificate.pdf`
- `docs/samples/ky-tb-4-completed-page.png`

The patient in those files is Test Patient Alpha, `alpha@example.test`, date of birth 01/01/1990.

## Form source

Kentucky Department for Public Health Tuberculosis (TB) Risk Assessment, TB-4 (3/2014):

https://www.chfs.ky.gov/agencies/dph/dehp/idb/Documents/tbtoolkitriskassessment.pdf

## Owner approval still required

These were found on the server and were not changed:

- SSH password authentication
- ufw disabled
- fail2ban not installed
- no off-site backups confirmed
- a world-writable imports directory
- operating-system updates

HIPAA readiness items that software cannot close are listed in `docs/security/hipaa-gap-report.md`. This project does not claim HIPAA compliance or that a signature is legally enforceable.

## New environment variables

`AUDIT_HMAC_KEY`, `FILE_ENCRYPTION_KEY_V1`, `SESSION_IDLE_MINUTES`, `TRUSTED_PROXY`, `MAIL_INCLUDE_DOCUMENT_TITLE`, `MAIL_TRANSPORT`, `MAIL_FILE_DIR`, `ENGAGE_ALLOW_FILE_MAIL`, `ENGAGE_ALLOW_TB_SEED`, and `SETUP_TOKEN` for a brand-new database. Values stay in `/etc/engage-sign-vps/app.env`.
