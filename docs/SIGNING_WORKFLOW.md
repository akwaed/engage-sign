# Sending and recipient signing

The administrator send form is `/admin/send`. Only active template versions appear. A saved draft may be edited; sending locks its template version and field assignments and creates a hash-verified prepared PDF. The first routing group receives invitation emails. Parallel routing puts all included signer roles in the first group; ordered routing follows the catalog order. Optional roles do not block completion.

Each invitation gets a fresh 32-byte random token. MySQL stores its SHA-256 hash and expiration, never the plaintext token. `/s/<token>` exchanges a valid invitation for a 30-minute HttpOnly recipient cookie and redirects to a URL without the token. Successful signing records `token_used_at`; expired, voided, declined, completed, or used links are rejected. The signing page and PDF endpoint require the recipient cookie and show the immutable PDF version whose hash is stored in the recipient session.

The recipient completes assigned text, date, checkbox, radio, and initials fields, chooses a typed or drawn signature, reviews the values and exact presented PDF, and explicitly accepts versioned electronic-signature consent. Submission locks the envelope row, validates assignment and required values, records the presented PDF hash, signer identity reference, UTC signing time, method, consent version, IP address, and user agent. The IP address, user agent, signer identity, field values, and signature payload are encrypted with AES-256-GCM. A repeated identical submission returns the prior success; a changed or reused submission is rejected. Every signed PDF version is stored privately and SHA-256 verified. Drawn signatures appear on mapped PDF signature boxes; Word-derived PDFs retain the typed name in merge locations and attach a drawn-signature evidence page.

## Deployment prerequisites

1. Back up the hosted MySQL database, apply migrations `001_template_lifecycle.sql` and `002_signing_workflow.sql` in order, and verify the new tables/columns. Preview and Published currently share the database.
2. Configure `PRIVATE_STORAGE_PATH` outside the public app root, `ENCRYPTION_KEY_V1` as base64 of exactly 32 random bytes, and the public HTTPS `APP_URL` in GoDaddy Secrets. Keep the encryption key backed up separately; losing it makes signer data unreadable. Use a different key for each environment if the environments are separated.
3. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and optionally `SMTP_REPLY_TO`. Sending is refused until SMTP and `APP_URL` are configured. Failed invitation attempts stay in `notification_outbox` for retry from the document status page. The next routing group is queued only after all required signers in the prior group sign.
4. Configure and verify `LIBREOFFICE_BIN` before sending Word-based templates. PDF templates do not require Word conversion.
5. Import, map, visually verify, and activate each template before it appears in the send form. Complete the legal-language, privacy, mail-deliverability, backup, and security release gates in the README before real use.

Reminder overrides are stored per document. A scheduled reminder job and production mail-deliverability verification remain separate release work. The consent text is a draft pending counsel approval.
