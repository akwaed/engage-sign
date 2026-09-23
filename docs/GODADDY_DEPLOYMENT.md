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

For a new, empty database, import `database/mysql/schema.sql`. For an existing database, **do not import a migration alone**: GoDaddy's importer drops all existing tables before running the uploaded SQL. Use **Export SQL** with each table set to **Everything**, verify that the download contains the expected `CREATE TABLE` and `INSERT INTO` statements, append the required migrations in order, then import the complete file. Keep the untouched export for recovery. After import, use **Browse tables** to verify the full table count, required columns, and administrator row.

GoDaddy's granular exporter produced malformed JSON in the September 23 backup: object columns became `'[object Object]'` and the reminder array became `'7,3,1'`. MySQL rejects these literals. Correct them in a *copy* of the export (`'{}'` and `'[7,3,1]'` respectively), inspect every changed value, and validate the import. The original object contents are not recoverable from that export. A failed import can leave only the tables reached before the error, so restore the complete corrected file before using the app.

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

Before deploying the template workspace, back up MySQL and apply `database/mysql/migrations/001_template_lifecycle.sql`. **Do not upload a migration file by itself to GoDaddy Hosted Database → Import SQL:** that importer drops existing tables before executing the uploaded file. Export all existing tables and rows first, verify the file, append the migration to that complete SQL dump, then import the combined file. Keep the original dump separately for recovery. GoDaddy's File Manager identifies `/private` as a private directory durable across deployments, so Preview uses `PRIVATE_STORAGE_PATH=/private/engage-sign`. The workspace refuses uploads until that directory is configured.

Word preview and test-fill use LibreOffice. The application tries `soffice` on the host's `PATH`, or `LIBREOFFICE_BIN` when set. PDF uploads, coordinate mapping, and PDF test-fill do not depend on LibreOffice. See [`TEMPLATE_WORKFLOW.md`](TEMPLATE_WORKFLOW.md).

## Signing workflow deployment

Apply `database/mysql/migrations/002_signing_workflow.sql` after the template migration. On GoDaddy, append both migrations in order to the verified full SQL export and import that combined file once; verify the existing administrator row and new columns/tables afterward. Configure `ENCRYPTION_KEY_V1` and SMTP secrets in Preview before sending a test invitation. Preview and Published currently share the hosted database; use test identities and a separated database before handling real participant data. See [`SIGNING_WORKFLOW.md`](SIGNING_WORKFLOW.md) for the full flow and remaining release checks.

### Current Preview release status (2026-09-23)

GoDaddy Preview is connected to `codex/signing-workflow`; the last verified deployed commit is `470f183`. Its build and site status are Healthy/OK, and the runtime log shows `next start` ready. The shared hosted database has 16 tables after applying migrations 001 and 002; the original administrator row remains active, and the `template_versions.lifecycle` and `envelopes.routing_mode` columns were verified. The app has not been published live.

The untouched, granular 14-table export is in the local Downloads folder with SHA-256 `4D8891287BC078C3BAD799CDC82E431AF29DEC2BA7A30402E9780864B59598E2`. GoDaddy's export switch has a misleading accessibility label: visually, blue and positioned toward **Everything** includes rows; the opposite position creates a schema-only file. The final 16-table import is under ignored `work/deployment/engage-sign-full-migrated-recovered.sql` with SHA-256 `58237AD1E388989B2D2878031092D1D8466DC112B5737AA5FABC276D9B1AAAB2`. Neither SQL file belongs in Git. GoDaddy's export discarded four audit-detail JSON objects and one legal-export scope object. The objects were reconstructed from the exact application event payloads; each audit event's SHA-256 hash verified after recovering its original millisecond timestamp. The legal-export scope was restored from the application code.

Preview secrets now include `ENCRYPTION_KEY_V1` and all Microsoft 365 SMTP values, including the password entered directly by the account owner. Preview was restarted to load the secret. The encryption key has a machine-protected local backup under ignored `work/deployment/`. All nine exact baselines were uploaded and hash-verified in GoDaddy private storage. Six Word revisions have saved role-assigned field maps; the three scanned PDF baselines have draft coordinate maps. A medication-completion PDF test-fill generated successfully. No version is active. A Word test-fill on deployed `470f183` failed with `LibreOffice is unavailable on this host`, confirming that `soffice` is absent from `PATH`. A verified converter is required before Word activation. The Preview health endpoint, SMTP delivery, and signing flow still need end-to-end checks. Preview and Published share the same database, so do not send real participant data or publish live until the production release gate passes.
