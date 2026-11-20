# Rollback

Point the live symlink back at the production release and restart:

```bash
ln -sfn /opt/engage-sign-vps/releases/20260930-consent /opt/engage-sign-vps/current
systemctl restart engage-sign-vps.service
curl -fsS http://127.0.0.1:3000/api/health
```

Restore the database from the dump taken before the migration window if you need the previous data. The new migrations are additive and are safe to leave in place if you only roll the code back:

- 004 adds columns, the rate-limit table, and nullable mail columns. The previous build ignores `can_publish` and `setup_completed`.
- 005 adds nullable `signers.email_lookup`.
- 006 widens field types and coordinates and adds draft-only triggers. A published catalog version stays readable.
- 007 adds `verification_method` with default `email_link`.
- 008 adds audit hash columns, stops cascade deletes of audit rows, and adds `retention_purge_enabled` default 0.

The previous build does not write `hash_alg` or `verification_method`. Leave those columns. Do not drop them as part of a code rollback.

New environment variables can stay in `app.env`. The previous build does not read them. If `FILE_ENCRYPTION_KEY_V1` was used and files were encrypted with `encrypt:files`, the previous build cannot read those files. Roll that back only if encryption was not run, or restore the private-storage snapshot taken before encryption.

Signer links, SMTP settings, and the session cookie name are unchanged.
