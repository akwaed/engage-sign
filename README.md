# Engage Sign — implementation baseline

Engage Sign is the first implementation milestone for Engage Support Services' internal document-signing workflow. It is intentionally built around the supplied nine-form baseline and a legal-evidence export.

## Working now

- A responsive staff dashboard for multi-signer progress, including partial completion such as “employee signed, awaiting trainer.”
- A mapped catalog for all nine supplied forms, with source SHA-256 hashes, source type, page count, field ownership, signer roles, and routing order.
- A data model for admins and staff, template versions, admin-fill and participant-fill fields, envelopes, ordered/parallel signers, immutable document versions, signature evidence, chained audit events, reminders/expiration, retention, and legal exports.
- A protected legal-export endpoint and UI. It creates a ZIP containing available source templates, prepared/presented/final documents, signer and field records, signature events, the audit chain, settings, a manifest, and SHA-256 checksums.
- Export integrity guards: if a private-storage file is missing or its current hash differs from the recorded hash, the export stops rather than silently creating an incomplete package.
- A MySQL 8 production schema under `database/mysql/` and generated D1 migrations for the Sites preview.

## Form mapping decisions

- The three supplied PDFs are flat scans without AcroForm fields, so they use coordinate overlays.
- The six Word files do not contain usable merge fields, so placeholders and assigned signer fields must be introduced as mapped template versions.
- Most forms use two signers. The application/background authorization is one applicant with two signature events. The competency checklist is evaluator-driven and supports an optional second RN evaluator.
- The CA and FHP contractor agreements remain in review because their source wording contains apparent inconsistencies. The implementation does not silently alter legal text.

## Security and deployment boundary

The current Sites build uses D1 and private R2 bindings for a runnable preview. The intended GoDaddy/Node production deployment should use `database/mysql/schema.sql` plus storage outside the public web root. Sensitive values are modeled as encrypted ciphertext with a key-version field; encryption keys must live outside the database.

The dashboard and legal-export endpoint require authenticated user headers. In production, provision users explicitly and authorize the complete legal export for administrators only. Public recipients use a separate one-time signing-token flow; never give recipients staff accounts.

## Still required before real signatures

- Template editor coordinates/placeholders and import of the nine source files into private storage.
- Recipient signing screen, consent text, typed/drawn signature capture, and one-time token lifecycle.
- Final PDF rendering with signatures and audit certificate baked in.
- Outlook SMTP sending, reminders, and daily expiration/retention scheduler.
- Production encryption-key management, explicit staff provisioning, rate limiting, monitoring, and counsel review of consent language and source-document wording.

## Run locally

```bash
npm install
npm run dev
```

Use the local Sites sign-in route when prompted. Generate a migration after schema changes with `npm run db:generate`; verify a release with `npm run build`.
