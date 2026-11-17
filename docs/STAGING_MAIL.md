# Staging file mail

Production delivery stays nodemailer to `smtp.office365.com:587` with STARTTLS and SMTP basic auth (`SMTP_USER` / `SMTP_PASSWORD`). Leave `MAIL_TRANSPORT` unset, or set it to `smtp`, on `https://sign.engagess.co`.

Staging on this VPS listens at `127.0.0.1:3001` with `APP_URL=http://localhost:3001` and does not have a mailbox that can receive signing or password-reset links. A file transport writes each outgoing message to disk so those links can be opened by hand.

Set all of these on the staging environment only:

```text
MAIL_TRANSPORT=file
MAIL_FILE_DIR=/var/lib/engage-sign-staging/mail
ENGAGE_ALLOW_FILE_MAIL=true
APP_URL=http://localhost:3001
```

`NODE_ENV=production` is what `next start` uses. File mail then stays off unless `ENGAGE_ALLOW_FILE_MAIL=true`. The process refuses to start if `MAIL_TRANSPORT=file` and `APP_URL` is `https://sign.engagess.co`, even when the allow flag is set.

`MAIL_FILE_DIR` must be an absolute directory outside the web root. The app creates it mode `0700` and writes each message as a mode `0600` `.eml` file containing `To`, `From`, `Subject`, the text body, and the HTML body. Invitation and reset links are in that file. The directory holds bearer links, so it must not be served by nginx and should be readable only by the staging user.

With file mail selected, the jobs timer and the sign-in reset action write files instead of opening an SMTP connection. `MAIL_ENABLED=false` still skips SMTP. File delivery does not use `SMTP_HOST`. The admin SMTP verify action reports success without contacting Office 365 while file mail is selected.

Do not set `MAIL_TRANSPORT=file` on the production unit.
