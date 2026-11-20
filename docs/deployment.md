# Deployment

This is the VPS layout. Do not run it against production until the owner chooses a window. Nothing in this repository restarts the service.

- Service: `engage-sign-vps.service`
- Releases: `/opt/engage-sign-vps/releases/<id>` with `/opt/engage-sign-vps/current` pointing at the live release
- Environment file: `/etc/engage-sign-vps/app.env` (not in git)
- App listen address: `127.0.0.1:3000` behind nginx
- Private files: `/var/lib/engage-sign-vps/private`
- Jobs: `engage-sign-jobs.timer` every 60 seconds
- Node: 22

## Before restart

Apply migrations with a privileged database account, in order, while the previous build is still running. They are additive.

1. `database/mysql/migrations/004_auth_rbac.sql`
2. `database/mysql/migrations/005_document_dashboard.sql`
3. `database/mysql/migrations/006_template_editor.sql`
4. `database/mysql/migrations/007_signing_verification.sql`
5. `database/mysql/migrations/008_security_controls.sql`

Migrations 001 through 003 are already on the production baseline. Each new file records itself in `schema_migrations` and can be applied once.

Add these to `/etc/engage-sign-vps/app.env` before starting the new build. Do not commit the values.

- `AUDIT_HMAC_KEY` — long random secret for new audit events
- `FILE_ENCRYPTION_KEY_V1` — base64 of 32 bytes, optional until you want new PDFs encrypted
- `SESSION_IDLE_MINUTES` — optional, default 30
- `TRUSTED_PROXY=1` — nginx is the one trusted proxy
- `MAIL_INCLUDE_DOCUMENT_TITLE` — leave unset
- `ENGAGE_ALLOW_TB_SEED` — leave unset on production
- `ENGAGE_ALLOW_FILE_MAIL` — leave unset on production
- `SETUP_TOKEN` — required only for a brand-new database

Existing keys that must remain: `ENCRYPTION_KEY_V1`, `IP_HASH_SECRET`, the MySQL settings, `APP_URL`, and the SMTP variables.

## Switch

```bash
cd /opt/engage-sign-vps/releases/<id>
npm ci
npm run build
ln -sfn /opt/engage-sign-vps/releases/<id> /opt/engage-sign-vps/current
systemctl restart engage-sign-vps.service
curl -fsS http://127.0.0.1:3000/api/health
```

The TB-4 template is not seeded by deploy. On a non-production host, after migrate and restart, an operator may run `npm run seed:tb -- --confirm`.

Encrypting files already on disk is a separate command, `npm run encrypt:files -- --confirm`, and is not part of restart.
