# VPS migration and build checklist

Target: **2 vCPU / 4 GB RAM / 40 GB NVMe**. Prepared 2026-09-23.

Status: planning workspace created; server provisioning, infrastructure implementation, migration, and deployment are pending. Checked items below describe repository preparation only. Record an owner and evidence for each completed release gate.

## 1. Starting point

- [x] Create a separate `engage-sign-vps` clone on `codex/vps-migration`.
- [x] Preserve the existing uncommitted changes in `app/api/admin/mail/route.ts` and `lib/signing-mail.ts`.
- [x] Rename the npm package and lockfile identity to `engage-sign-vps`.
- [x] Preserve the previous README as `docs/IMPLEMENTATION_BASELINE.md`.
- [ ] Create/connect a separate Git remote for the VPS project and configure CI.

Keep the implemented staff authentication, roles, recipient tokens, ordered/parallel signing, encrypted evidence, MySQL adapter, private filesystem adapter, template mapping, PDF finalization, legal ZIPs, and SMTP outbox. Validate them on the VPS; they do not need to be rewritten merely to change hosts.

Current gaps found in the code/docs:

- LibreOffice conversion exists but the previous host lacked `soffice`. Each request can spawn a process; there is no global concurrency limit.
- Mail dispatch, idempotent reminder queueing, and expiration functions exist. Unattended scheduling and operational recovery still need implementation.
- `/api/health` queries MySQL but always returns HTTP 200, including database failure.
- The MySQL connection pool permits eight connections per Node process.
- Private storage requires an absolute, non-symlink root outside the application directory.
- Forwarded host/protocol/IP headers influence origin checks and evidence. The reverse proxy must replace untrusted client values.
- Full exports assemble data in memory. Archive size and concurrent exports need measurement on this machine.
- README reports old-host SMTP egress failure and incomplete domain authentication. Recheck from the VPS; historical observations are not a current provider test.

## 2. Target architecture and capacity

Proposed initial layout: Linux LTS, Nginx for HTTPS, one Next.js Node process managed by systemd, local MySQL, private disk storage, LibreOffice, and systemd timers for jobs/backups. Reuse the database outbox initially. Avoid adding another database-backed queue service until measurements justify it. Keep outbound delivery with an external authenticated mail provider.

Nginx -> Node on `127.0.0.1:3000` -> MySQL on loopback and private files. Only HTTPS/HTTP and restricted SSH are public. [Next.js recommends a reverse proxy for self-hosting](https://nextjs.org/docs/app/guides/self-hosting).

Planning envelopes, **not measured usage or hard limits**:

| RAM consumer                | Initial allowance |
| --------------------------- | ----------------: |
| OS, proxy, monitoring       |            600 MB |
| MySQL total process         |            900 MB |
| Node app and short job runs |          1,000 MB |
| One LibreOffice conversion  |            700 MB |
| Headroom                    |            800 MB |

- [ ] Validate these envelopes with representative documents and concurrent signing. Tune MySQL buffer pool initially around 512 MB; measure total process memory separately.
- [ ] Use one app process and at most one conversion at a time; bound pending jobs and archive concurrency. Implement this before load testing.
- [ ] Consider 1-2 GB swap for emergency pressure, counting it against disk. Repeated swapping or OOM events fail the capacity gate.
- [ ] Build in compatible Linux CI, not beside live MySQL and signing traffic on the VPS. Pin a supported Node version satisfying `package.json` and validate it in CI and production.
- [ ] Confirm provider OS/image, CPU architecture, backup options, root/sudo access, and outbound SMTP policy before provisioning.

| Disk allocation                             | Starting budget |
| ------------------------------------------- | --------------: |
| OS, installed tools, LibreOffice/fonts      |            8 GB |
| Current and previous application releases   |            5 GB |
| MySQL data and bounded binary logs          |            6 GB |
| Private source/generated documents          |           10 GB |
| Logs, conversion temp files, backup staging |            3 GB |
| Swap                                        |            2 GB |
| Unallocated reserve                         |            6 GB |

Usable disk may be below the advertised 40 GB. Measure actual capacity and current database/private-file size before approving this budget. Off-server backups are additional storage. Multiple immutable PDFs plus ZIPs can make per-envelope usage much larger than the original template.

- [ ] Alert at 70% disk usage; treat 80% as urgent and expand capacity before reserve is exhausted. Bound logs, temp files, release count, and backup staging.
- [ ] Measure bytes per completed envelope and expected monthly volume; estimate months to capacity and document an upgrade/object-storage threshold.
- [ ] Run staging elsewhere or temporarily on this VPS with synthetic data and scheduled downtime. Do not budget a second full production stack into 4 GB RAM.

## 3. Build the host and deployment foundation

- [ ] Provision the selected Linux LTS image, SSH keys, a sudo operator, a separate app service user, security updates, UTC time synchronization, and restricted firewall rules. Verify key access before disabling password/root login.
- [ ] Install pinned/tested Node, compatible MySQL, Nginx, LibreOffice Writer and required fonts. Keep MySQL off public interfaces.
- [ ] Create `/opt/engage-sign-vps/releases/<release-id>` with a `current` symlink for code; keep only current/previous validated releases.
- [ ] Create the actual directory `/var/lib/engage-sign-vps/private`, owned by the service user, mode 0700. It must not be a symlink or a web-served directory; files should be 0600.
- [ ] Store production environment settings in protected `/etc/engage-sign-vps/app.env`, outside Git and release artifacts. Limit access to the service manager/operator.
- [ ] Add reviewed provisioning scripts, `deploy/vps/nginx.conf`, `deploy/vps/engage-sign-vps.service`, timer/service units, backup/restore scripts, and a deployment runbook. These artifacts are still to be built.
- [ ] Bind Next.js to loopback; configure systemd restart/backoff, working directory, environment file, graceful shutdown, writable paths, and automatic boot startup.
- [ ] Configure DNS and automatic HTTPS certificate issuance/renewal. Confirm the production hostname; proposed existing URL is `https://sign.engagess.co`.
- [ ] Configure proxy upload/time limits around actual template sizes and conversion timeout. Replace forwarded host/protocol/IP headers with trusted values; verify secure cookies, CSRF/origin checks, and captured client IP.
- [ ] Redact `/s/<token>` paths and query strings in proxy/access/error monitoring logs; keep tokens and personal data out of logs.
- [ ] Create CI for dependency install, tests, lint and production build, plus secret/dependency checks. Record artifact checksum, commit, runtime, and migration level.
- [ ] Deploy a versioned Linux artifact with required dependencies and assets; verify imports, native binaries, PDF worker/static assets, and start/restart after reboot.

## 4. Configure secrets, database, and document conversion

- [ ] Inventory the actual source MySQL version, schema/migration level, table counts, triggers, routines/events, storage size, and all private storage locations. Previous docs say Preview/Published share MySQL; verify every writer.
- [ ] Select a supported compatible MySQL release and prove a restore on it. Use separate schema-migration and least-privilege runtime accounts.
- [ ] For a fresh empty environment, inspect the baseline and migrations 001-003, then apply each required change once. For restored data, restore the full schema/data and apply only verified missing migrations. Never blindly replay migrations over an upgraded database.
- [ ] Add a migration ledger and preflight checks; take recoverable backups before DDL. Document forward fixes and app rollback compatibility rather than assuming destructive schema rollback is safe.
- [ ] Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `PRIVATE_STORAGE_PATH`, `LIBREOFFICE_BIN`, and HTTPS `APP_URL` explicitly; remove reliance on host-injected values.
- [ ] Securely migrate the **existing** encryption keys with any restored ciphertext, including every active key version. Preserve `IP_HASH_SECRET` as needed for audit continuity. Generating a new encryption key does not decrypt old records.
- [ ] Use separate keys and credentials for synthetic staging. Back up production decryption keys separately with restricted access and a tested recovery procedure.
- [ ] Set a new setup token only if bootstrapping an empty database. Preserve existing administrators on restore; prevent setup from creating an extra owner.
- [ ] Install/locate `soffice`, set `LIBREOFFICE_BIN`, and validate temporary-directory permissions, timeout behavior, cleanup after killed processes, and conversion serialization.
- [ ] Import/transfer all nine source templates and stored revisions/maps; sources are outside Git in the original sibling `engage docs` folder. Preserve identifiers, storage keys and recorded hashes.
- [ ] Visually approve Word/PDF output, page breaks, fonts, and all signer field positions. Resolve CA/FHP content issues before activating those templates.

## 5. Finish jobs and outbound email

- [ ] Build an internal CLI/worker entry point for existing expiration, reminder queueing, and mail dispatch functions; handle their server-only module requirements in its build/runtime. Do not schedule an administrator browser session or expose an unauthenticated job route.
- [ ] Schedule bounded mail dispatch every minute and reminders/expiration every five minutes as initial intervals. Run in UTC and make intervals configurable.
- [ ] Add single-run locking, persistent claims, stale-claim recovery, retries/backoff, and failure alerts. Test crash/restart mid-send and document how ambiguous SMTP delivery is handled to reduce duplicate invitations.
- [ ] Verify invalid/expired/voided tokens remain rejected even if the scheduled job is delayed.
- [ ] Keep destructive retention disabled initially. Implement administrator policy, `NULL = keep forever`, dry-run/export/backup checks, audit trail, and recovery before enabling any purge.
- [ ] Configure SMTP credentials securely; verify outbound TLS/authentication from the VPS and send a controlled delivery test. Confirm compatibility with the mail account's allowed authentication method; adapt the transport if required.
- [ ] Recheck SPF, DKIM, and DMARC with the mail/domain administrator. Test recipient delivery, bounce/failure handling, invitation links, ordered next-signer mail, reminders, and completion notices.

## 6. Backups, monitoring, and recovery

- [ ] Build encrypted off-server backups of MySQL plus private documents, and separate protected key/config recovery. Start with nightly backups and a pre-deploy snapshot; agree recovery-point/recovery-time targets before launch.
- [ ] Capture a consistent DB/files pair by pausing all writers during the backup window, or implement and test a coordinated snapshot mechanism. Include templates, PDFs, signature objects, and archives.
- [ ] Preserve triggers/routines/events where present and binary data in dumps; inspect DEFINER/privilege compatibility. MySQL documents separate dump options for these objects in [mysqldump](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html).
- [ ] Define off-server retention, encryption, access restrictions, upload verification, and bounded local staging. Provider snapshots supplement tested application backups.
- [ ] Restore onto an isolated environment and prove login, ciphertext decryption, file hashes, audit chains, and archive verification. Record elapsed restore time and achieved recovery point.
- [ ] Split liveness/readiness or return non-200 for unavailable dependencies. Monitor DB readiness, private-storage access, disk space, certificate expiry, OOM/restarts, job freshness, mail backlog, and backup age.
- [ ] Add redacted structured logs, bounded log retention, and alerts delivered outside this VPS. Name the operator and escalation contact.

## 7. Validate the release

- [ ] Run repository tests, lint, and a Linux production build. Preserve results with the release artifact.
- [ ] Verify admin/staff boundaries, disabled users, session expiry, secure cookies, setup protection, and private file access through the real reverse proxy.
- [ ] Exercise one signer, ordered/parallel signers, optional evaluator, expired/reused token, decline, void, and retry after interruption with synthetic data.
- [ ] Verify final PDFs, immutable hashes, encrypted evidence, legal exports, and missing/tampered-file rejection. Complete a keyboard/mobile signing check.
- [ ] Load test the largest expected DOCX/PDF and legal export while signing and mail jobs run. Record peak RAM, CPU, temporary disk, latency, and queue recovery. No OOM, corrupted files, duplicate signing records, or growing backlog is acceptable.
- [ ] Prove reboot recovery, failed conversion cleanup, SMTP outage retry, DB outage alerts, and disk-pressure handling.
- [ ] Complete existing legal/content approvals and security review; name the release owner and capture sign-off.

## 8. Migrate and cut over

1. [ ] Rehearse the whole restore and acceptance checklist with an isolated copy; disable outbound email and public signing on the rehearsal environment.
2. [ ] Record rollback checkpoints, lower DNS TTL in advance, and define the maintenance window. Inventory already-issued links and retain the original hostname/path behavior when moving them.
3. [ ] Put every old deployment into maintenance mode, block all signing/admin writes, and stop old mail/reminder workers. Wait for active requests/jobs to finish.
4. [ ] Take the final consistent database dump and private-file copy, record counts/checksums, and transfer keys securely. Keep the source recovery snapshot intact.
5. [ ] Restore to the VPS, verify schema level/counts/file hashes/decryption/audit chains, and run smoke checks using the intended hostname before directing public traffic.
6. [ ] Switch DNS, check both IPv4/IPv6 records as applicable, verify HTTPS and signing links externally, and enable exactly one set of workers. Confirm traffic reaching the old server cannot write during DNS propagation.
7. [ ] Observe errors, mail backlog, CPU/RAM/disk, and signing/archive results through an agreed observation window. Keep the old host read-only until recovery is proven.
8. [ ] Retire old hosting and revoke obsolete credentials only after successful validation and retained backups are verified.

Rollback before new VPS writes: keep writes stopped, restore the previous traffic route, then re-enable the old instance after validation. Rollback after new VPS writes: stop all writers again and reconcile/transfer the new DB/files consistently before switching back. Merely reverting DNS can lose new signatures and split document history. Code rollback must use a release compatible with the current schema.

## Next implementation batch

Build provisioning/configuration artifacts, systemd services/timers, a bounded conversion/job runner, readiness checks, and backup/restore scripts. Then rehearse on the chosen VPS. Provider/address, OS, SSH access, DNS ownership, external backup destination, mail authentication, and source-data access are inputs needed for live deployment.
