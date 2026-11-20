-- HMAC audit payloads, no cascade from envelopes, and retention purge stays off.

SET @hash_alg_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_events' AND COLUMN_NAME = 'hash_alg'
);
SET @hash_alg_sql := IF(
  @hash_alg_exists = 0,
  'ALTER TABLE audit_events ADD COLUMN hash_alg VARCHAR(20) NOT NULL DEFAULT ''sha256'' AFTER event_hash, ADD COLUMN canonical_payload TEXT NULL AFTER hash_alg',
  'DO 0'
);
PREPARE engage_hash_alg FROM @hash_alg_sql;
EXECUTE engage_hash_alg;
DEALLOCATE PREPARE engage_hash_alg;

SET @purge_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'retention_purge_enabled'
);
SET @purge_sql := IF(
  @purge_exists = 0,
  'ALTER TABLE system_settings ADD COLUMN retention_purge_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER retention_days',
  'DO 0'
);
PREPARE engage_purge FROM @purge_sql;
EXECUTE engage_purge;
DEALLOCATE PREPARE engage_purge;

SET @audit_fk := (
  SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_events'
     AND COLUMN_NAME = 'envelope_id' AND REFERENCED_TABLE_NAME = 'envelopes'
   LIMIT 1
);
SET @drop_fk_sql := IF(
  @audit_fk IS NULL,
  'DO 0',
  CONCAT('ALTER TABLE audit_events DROP FOREIGN KEY ', @audit_fk)
);
PREPARE engage_drop_fk FROM @drop_fk_sql;
EXECUTE engage_drop_fk;
DEALLOCATE PREPARE engage_drop_fk;

SET @restrict_exists := (
  SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'audit_events'
     AND CONSTRAINT_NAME = 'audit_events_envelope_fk'
     AND DELETE_RULE = 'RESTRICT'
);
SET @restrict_sql := IF(
  @restrict_exists = 0,
  'ALTER TABLE audit_events ADD CONSTRAINT audit_events_envelope_fk FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE RESTRICT',
  'DO 0'
);
PREPARE engage_restrict FROM @restrict_sql;
EXECUTE engage_restrict;
DEALLOCATE PREPARE engage_restrict;

DROP TRIGGER IF EXISTS audit_events_guard_delete;
DELIMITER $$
CREATE TRIGGER audit_events_guard_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
BEGIN
  IF COALESCE(@engage_retention_purge, 0) <> 1
     OR COALESCE((SELECT retention_purge_enabled FROM system_settings WHERE id = 'global'), 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit events are append-only and are not deleted automatically';
  END IF;
END$$
DELIMITER ;

SET @ledger_version := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations' AND COLUMN_NAME = 'version'
);
SET @ledger_sql := IF(
  @ledger_version > 0,
  'INSERT INTO schema_migrations (version, applied_at) SELECT ''008_security_controls'', UTC_TIMESTAMP(6) FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = ''008_security_controls'')',
  'DO 0'
);
PREPARE engage_ledger FROM @ledger_sql;
EXECUTE engage_ledger;
DEALLOCATE PREPARE engage_ledger;
