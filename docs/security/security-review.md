# Security review

This describes the controls in the application after Phase 6. It is not a penetration test and it is not a HIPAA compliance claim.

## Audit log

New events are HMAC-SHA256 when `AUDIT_HMAC_KEY` is set. The canonical payload is stored with the event so it can be recomputed. Older events stay on plain SHA-256 and remain linked by `previous_hash`. `GET /api/admin/audit/verify` (administrators only) walks the chain.

MySQL triggers reject updates. Deletes are rejected unless a retention purge is explicitly enabled in `system_settings` and the session variable `@engage_retention_purge` is set. The application never sets that flag. Deleting an envelope does not cascade into `audit_events` (`ON DELETE RESTRICT`).

## Audit certificate

Completed documents already download a certificate PDF from `/api/envelopes/[id]/certificate` for an authorized reader. The certificate includes signer name and role, signature method, verification method (`email_link` today), UTC timestamp, IP address, user agent, consent version, presented-document hash, final PDF SHA-256, and the template version id and source hash.

## Browser headers

Every response sends a Content-Security-Policy that allows the pdf.js worker (`worker-src 'self' blob:` and `wasm-unsafe-eval`) and same-origin frames for the signing preview. Also set: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, a strict referrer policy, a locked-down permissions policy, and HSTS.

## Files at rest

`FILE_ENCRYPTION_KEY_V1` (base64, 32 bytes) encrypts new template PDFs and document PDFs with AES-256-GCM. The key id is the version byte in the `ESENC1` header. The associated data is the storage key. Files written before the key existed are still read as plaintext. `npm run encrypt:files -- --confirm` encrypts existing plaintext PDFs and is not called by startup or the jobs timer.

## Sessions and uploads

Staff sessions expire after 12 hours and also after `SESSION_IDLE_MINUTES` without activity (default 30). PDF uploads must start with `%PDF-`, stay within 20 MB and 30 pages, and are rebuilt so JavaScript and embedded files are dropped.

## Retention

Administrators can store a retention period at `/admin/settings`. Saving it forces `retention_purge_enabled` back to 0. No job deletes documents or audit rows.

## Still outside this application

See `docs/security/hipaa-gap-report.md`. Production SMTP remains Office 365 on port 587 with STARTTLS and basic auth. No SMTP OAuth was added.
