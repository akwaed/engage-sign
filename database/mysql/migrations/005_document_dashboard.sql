-- Additive recipient email lookup for exact dashboard search.
-- The column is nullable. The previous release ignores it and still starts.
-- Values are HMAC-SHA256 of the normalized email, written by the application.
-- Existing signer rows stay NULL until the app backfills them on the next
-- documents page load. No plaintext email is added.

SET @email_lookup_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'signers'
     AND COLUMN_NAME = 'email_lookup'
);
SET @email_lookup_sql := IF(
  @email_lookup_exists = 0,
  'ALTER TABLE signers ADD COLUMN email_lookup CHAR(64) NULL AFTER email_encrypted, ADD INDEX signers_email_lookup_idx (email_lookup)',
  'DO 0'
);
PREPARE engage_email_lookup FROM @email_lookup_sql;
EXECUTE engage_email_lookup;
DEALLOCATE PREPARE engage_email_lookup;

SET @ledger_version := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'schema_migrations'
     AND COLUMN_NAME = 'version'
);
SET @ledger_sql := IF(
  @ledger_version > 0,
  'INSERT INTO schema_migrations (version, applied_at) SELECT ''005_document_dashboard'', UTC_TIMESTAMP(6) FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = ''005_document_dashboard'')',
  'DO 0'
);
PREPARE engage_ledger FROM @ledger_sql;
EXECUTE engage_ledger;
DEALLOCATE PREPARE engage_ledger;
