# MySQL production database

`schema.sql` is the MySQL 8 baseline for the production GoDaddy/Node deployment. It models users and two-role access, versioned templates, mixed admin/signer fields, ordered or parallel signers, partial completion, immutable document versions, signature evidence, chained audit events, retention settings, and legal exports.

The Sites preview uses its generated D1 adapter so it can run in the hosted preview environment. The production application should use the same service boundaries with this MySQL schema and a private filesystem or object-storage adapter. Do not place source or signed files under the public web root.

Before accepting real signatures:

1. Provision encryption keys outside the database and record their version with each encrypted value.
2. Create the first admin explicitly; do not auto-promote the first public visitor.
3. Give the runtime database account only the privileges it needs. Keep schema migration credentials separate.
4. Run the scheduler for reminders, expiration locking, and retention. A purge must set `@engage_retention_purge = 1` only inside the controlled retention transaction.
5. Back up both MySQL and private file storage. The in-app legal archive is an additional portable evidence package, not the only operational backup.
