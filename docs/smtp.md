# Email

Production mail is unchanged: nodemailer to `smtp.office365.com` port 587 with STARTTLS and SMTP basic auth. There is no OAuth.

Environment variables, names only:

- `SMTP_HOST`
- `SMTP_PORT` (587 or 465 when SMTP is in use)
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `SMTP_REPLY_TO`
- `APP_URL`

`MAIL_TRANSPORT` defaults to SMTP. Set `MAIL_TRANSPORT=file` and an absolute `MAIL_FILE_DIR` to write messages to disk for staging. File mail is refused when `APP_URL` is `https://sign.engagess.co`. When `NODE_ENV=production` it also requires `ENGAGE_ALLOW_FILE_MAIL=true`. With file mail selected, sending a document does not check `SMTP_PORT`.

Signing mail subjects stay generic. The document title is omitted from the body unless `MAIL_INCLUDE_DOCUMENT_TITLE=true`. Messages do not attach the PDF.
