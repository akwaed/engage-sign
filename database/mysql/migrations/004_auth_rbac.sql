-- Additive auth, reset, and role columns. Apply with a privileged MySQL account
-- after a backup. The application database user cannot run DDL.
-- Re-running is safe: new columns and the foreign key are added only when missing.
-- The previous Node release does not read these columns and still starts.
--
-- schema_migrations on production already lists 000, 001, 002, and 003.
-- This script records 004_auth_rbac when that table has a version column.
-- If the live ledger uses a different column name, the data changes still apply
-- and the script skips the ledger insert instead of failing.

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin', 'staff', 'template_manager', 'standard_user') NOT NULL;

SET @can_publish_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'users'
     AND COLUMN_NAME = 'can_publish'
);
SET @can_publish_sql := IF(
  @can_publish_exists = 0,
  'ALTER TABLE users ADD COLUMN can_publish TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0'
);
PREPARE engage_can_publish FROM @can_publish_sql;
EXECUTE engage_can_publish;
DEALLOCATE PREPARE engage_can_publish;

SET @setup_flag_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'system_settings'
     AND COLUMN_NAME = 'setup_completed'
);
SET @setup_flag_sql := IF(
  @setup_flag_exists = 0,
  'ALTER TABLE system_settings ADD COLUMN setup_completed TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0'
);
PREPARE engage_setup_flag FROM @setup_flag_sql;
EXECUTE engage_setup_flag;
DEALLOCATE PREPARE engage_setup_flag;

UPDATE system_settings
   SET setup_completed = 1
 WHERE EXISTS (SELECT 1 FROM users);

INSERT INTO system_settings (
  id, default_expiration_days, reminder_schedule_json, retention_days,
  updated_by, updated_at, setup_completed
)
SELECT 'global', 14, JSON_ARRAY(7, 3, 1), NULL, NULL, UTC_TIMESTAMP(6), 1
 WHERE EXISTS (SELECT 1 FROM users)
   AND NOT EXISTS (SELECT 1 FROM system_settings WHERE id = 'global');

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket VARCHAR(64) NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  window_start DATETIME(6) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, subject_hash, window_start)
) ENGINE=InnoDB;

ALTER TABLE notification_outbox
  MODIFY COLUMN signer_id CHAR(36) NULL;

SET @user_id_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'notification_outbox'
     AND COLUMN_NAME = 'user_id'
);
SET @user_id_sql := IF(
  @user_id_exists = 0,
  'ALTER TABLE notification_outbox ADD COLUMN user_id CHAR(36) NULL AFTER signer_id',
  'DO 0'
);
PREPARE engage_user_id FROM @user_id_sql;
EXECUTE engage_user_id;
DEALLOCATE PREPARE engage_user_id;

SET @user_fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'notification_outbox'
     AND CONSTRAINT_NAME = 'notification_outbox_user_fk'
);
SET @user_fk_sql := IF(
  @user_fk_exists = 0,
  'ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
  'DO 0'
);
PREPARE engage_user_fk FROM @user_fk_sql;
EXECUTE engage_user_fk;
DEALLOCATE PREPARE engage_user_fk;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(191) NOT NULL,
  applied_at DATETIME(6) NOT NULL,
  PRIMARY KEY (version)
) ENGINE=InnoDB;

SET @ledger_version := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'schema_migrations'
     AND COLUMN_NAME = 'version'
);
SET @ledger_sql := IF(
  @ledger_version > 0,
  'INSERT INTO schema_migrations (version, applied_at) SELECT ''004_auth_rbac'', UTC_TIMESTAMP(6) FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = ''004_auth_rbac'')',
  'DO 0'
);
PREPARE engage_ledger FROM @ledger_sql;
EXECUTE engage_ledger;
DEALLOCATE PREPARE engage_ledger;
