# GoDaddy launch guide

This project now runs as a standard Next.js/Node application. GoDaddy should run:

```text
npm install
npm run build
npm start
```

`npm start` automatically uses the `PORT` supplied by GoDaddy. Do not use `wrangler dev` for the GoDaddy deployment.

GoDaddy Preview currently invokes `npm run dev`, independently of the production
start command. The development script explicitly uses `next dev --webpack` because
the preview sandbox denies the internal process/port operation used by Turbopack
when compiling CSS. Keep this flag when updating Next.js. Production continues to
use `npm run build` followed by `npm start`.

After updating Preview, verify the runtime logs show `next dev --webpack`, then
check `/login` and `/api/health`. A Healthy build badge alone does not establish
that pages compile or that the database is reachable. If the logs still show a
working-directory or SWC download error after a fresh deployment, investigate the
GoDaddy runtime separately; changing the bundler does not repair those conditions.

## 1. Update the Preview build

1. Push the latest `main` branch to GitHub.
2. In GoDaddy, open the app and select **Update Preview**.
3. Wait until **Preview Build status** changes to **Healthy**.
4. Open `/api/health`. Before the schema is imported it can report `database: unavailable`; after import it should report `database: connected`.

## 2. Import the database schema

GoDaddy has already attached a MySQL database and injects these runtime values automatically:

```text
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
```

Do not copy or override those values.

1. Open **Settings → Hosted Database**.
2. Select **Import SQL**.
3. Upload `database/mysql/schema.sql` from this repository.
4. When the import completes, use **Browse tables** and confirm that `users`, `staff_sessions`, `audit_events`, and the other baseline tables exist.

Preview and Published currently share this hosted database. Treat Preview as sensitive after real records are added.

## 3. Add application secrets

Yes—use GoDaddy **Secrets**. Never put secret values in GitHub or source code.

Generate two different random values on your computer:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

In **Settings → Secrets → Preview**, add:

| Name             | Value                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| `SETUP_TOKEN`    | First generated value; used once to create the first administrator      |
| `IP_HASH_SECRET` | Second generated value; used to protect IP-derived audit identifiers    |
| `APP_URL`        | Preview URL for preview; later `https://sign.engagess.co` for Published |

For signing invitations, also configure `ENCRYPTION_KEY_V1`, `PRIVATE_STORAGE_PATH`, the SMTP secrets in `.env.example`, and an HTTPS `APP_URL`. Do not send real invitations until the template, storage, mail, and consent checks in [`SIGNING_WORKFLOW.md`](SIGNING_WORKFLOW.md) are complete.

Save the same required application secrets in **Publish**, using **Sync from Preview** only if GoDaddy clearly shows which direction the copy will occur. Use separate Preview and Published secrets when GoDaddy supports separate databases and storage.

## 4. Create the first administrator

1. Open `https://YOUR-PREVIEW-URL/setup`.
2. Enter the administrator's name, email, a password of at least 14 characters, and the exact `SETUP_TOKEN` value.
3. Sign in at `/login`.
4. Return to GoDaddy Secrets and remove `SETUP_TOKEN` from Preview and Published.

The setup endpoint checks that the database has no users and uses a server-side lock. The first visitor is never promoted automatically, and setup permanently closes after the first account exists.

## 5. Verify access control

As the administrator:

1. Open **Users** and create one test `staff` account.
2. Confirm the staff account can sign in but cannot open `/admin/users` or run a complete legal export.
3. Disable the test account and confirm its active sessions stop working.
4. Reset the test password and confirm prior sessions remain revoked.

## 6. Publish and connect `sign.engagess.co`

Only continue after Preview is healthy and the checks above pass.

1. Select **Publish to Live**.
2. In **Settings → Domains**, choose **Connect custom domain**.
3. Enter `sign.engagess.co`.
4. If DNS is hosted at GoDaddy, use the offered automatic connection. Otherwise copy the exact CNAME/verification records into the DNS provider.
5. Wait for the domain status and SSL certificate to show active.
6. Set Published `APP_URL` to `https://sign.engagess.co` and redeploy/restart Published.
7. Verify `https://sign.engagess.co/api/health`, `/login`, administrator access, and sign-out.

## 7. Production limits that remain

The staff and recipient signing paths are implemented in code, but this is not yet approved for real signatures or sensitive participant data. Hosted SMTP and encryption secrets, recipient end-to-end testing, scheduled reminders, backup/restore drills, legal-language approval, and the security review remain release blockers in the main README.

## Template workspace deployment

Before deploying the template workspace, back up MySQL and apply `database/mysql/migrations/001_template_lifecycle.sql` through Hosted Database import. GoDaddy's File Manager identifies `/private` as a private directory durable across deployments, so Preview uses `PRIVATE_STORAGE_PATH=/private/engage-sign`. The workspace refuses uploads until that directory is configured.

Word preview and test-fill use LibreOffice. Set `LIBREOFFICE_BIN` to the host's `soffice` executable only after verifying that GoDaddy permits it. PDF uploads, coordinate mapping, and PDF test-fill do not depend on LibreOffice. The nine original source files must be supplied and hash-checked before marking the catalog imported. See [`TEMPLATE_WORKFLOW.md`](TEMPLATE_WORKFLOW.md).

## Signing workflow deployment

Apply `database/mysql/migrations/002_signing_workflow.sql` only after the template migration and a verified database backup. Configure `ENCRYPTION_KEY_V1` and SMTP secrets in Preview before sending a test invitation. Preview and Published currently share the hosted database; use test identities and a separated database before handling real participant data. See [`SIGNING_WORKFLOW.md`](SIGNING_WORKFLOW.md) for the full flow and remaining release checks.

### Current Preview release blockers (2026-09-23)

The GoDaddy project is connected to GitHub `main`; the template and signing workflows are on feature branches. The app has not been published live. The hosted database has an administrator row, but an **Everything** export from GoDaddy's Hosted Database panel downloaded only table definitions and no row inserts. That file is not a recoverable backup. Obtain and verify a complete backup through GoDaddy support or another approved database export path before importing either migration. Preview currently has no `ENCRYPTION_KEY_V1` or SMTP secrets, and the nine baseline templates have not been imported and activated. Keep the application on the existing build until these prerequisites are satisfied.
