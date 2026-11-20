-- Records how a signer proved they opened the request. email_link is the
-- current method. The column accepts a future email_otp value without
-- another table change. Existing rows stay email_link.

SET @method_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'signature_events'
     AND COLUMN_NAME = 'verification_method'
);
SET @method_sql := IF(
  @method_exists = 0,
  'ALTER TABLE signature_events ADD COLUMN verification_method VARCHAR(40) NOT NULL DEFAULT ''email_link'' AFTER signature_method',
  'DO 0'
);
PREPARE engage_verification_method FROM @method_sql;
EXECUTE engage_verification_method;
DEALLOCATE PREPARE engage_verification_method;

SET @ledger_version := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'schema_migrations'
     AND COLUMN_NAME = 'version'
);
SET @ledger_sql := IF(
  @ledger_version > 0,
  'INSERT INTO schema_migrations (version, applied_at) SELECT ''007_signing_verification'', UTC_TIMESTAMP(6) FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = ''007_signing_verification'')',
  'DO 0'
);
PREPARE engage_ledger FROM @ledger_sql;
EXECUTE engage_ledger;
DEALLOCATE PREPARE engage_ledger;
