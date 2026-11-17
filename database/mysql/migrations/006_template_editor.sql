-- Additive visual-editor fields. Previous releases ignore the new columns.
-- Existing coordinates stay on the 0–1000 grid. New drafts may use PDF points.
-- Published versions cannot change their PDF, signer plan, or fields.

ALTER TABLE template_fields
  MODIFY COLUMN field_type ENUM(
    'text', 'multiline', 'date', 'checkbox', 'radio', 'dropdown',
    'initials', 'signature', 'email', 'phone'
  ) NOT NULL,
  MODIFY COLUMN x DECIMAL(8,2) NULL,
  MODIFY COLUMN y DECIMAL(8,2) NULL,
  MODIFY COLUMN width DECIMAL(8,2) NULL,
  MODIFY COLUMN height DECIMAL(8,2) NULL;

SET @group_key_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'template_fields' AND COLUMN_NAME = 'group_key'
);
SET @group_key_sql := IF(
  @group_key_exists = 0,
  'ALTER TABLE template_fields ADD COLUMN group_key VARCHAR(100) NULL AFTER signer_role, ADD COLUMN options_json JSON NULL AFTER group_key, ADD COLUMN date_format VARCHAR(40) NULL AFTER options_json',
  'DO 0'
);
PREPARE engage_field_options FROM @group_key_sql;
EXECUTE engage_field_options;
DEALLOCATE PREPARE engage_field_options;

SET @space_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'template_versions' AND COLUMN_NAME = 'coordinate_space'
);
SET @space_sql := IF(
  @space_exists = 0,
  'ALTER TABLE template_versions ADD COLUMN coordinate_space ENUM(''grid1000'', ''pdf_points'') NOT NULL DEFAULT ''grid1000'' AFTER layout_strategy',
  'DO 0'
);
PREPARE engage_coordinate_space FROM @space_sql;
EXECUTE engage_coordinate_space;
DEALLOCATE PREPARE engage_coordinate_space;

DROP TRIGGER IF EXISTS template_fields_draft_only_update;
DROP TRIGGER IF EXISTS template_fields_draft_only_delete;
DROP TRIGGER IF EXISTS template_fields_draft_only_insert;
DROP TRIGGER IF EXISTS template_versions_protect_published;

DELIMITER $$
CREATE TRIGGER template_fields_draft_only_update
BEFORE UPDATE ON template_fields
FOR EACH ROW
BEGIN
  IF (SELECT lifecycle FROM template_versions WHERE id = OLD.template_version_id) <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published template fields are immutable';
  END IF;
END$$
CREATE TRIGGER template_fields_draft_only_delete
BEFORE DELETE ON template_fields
FOR EACH ROW
BEGIN
  IF (SELECT lifecycle FROM template_versions WHERE id = OLD.template_version_id) <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published template fields are immutable';
  END IF;
END$$
CREATE TRIGGER template_fields_draft_only_insert
BEFORE INSERT ON template_fields
FOR EACH ROW
BEGIN
  IF (SELECT lifecycle FROM template_versions WHERE id = NEW.template_version_id) <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published template fields are immutable';
  END IF;
END$$
CREATE TRIGGER template_versions_protect_published
BEFORE UPDATE ON template_versions
FOR EACH ROW
BEGIN
  IF OLD.lifecycle <> 'draft' AND (
    NEW.source_hash <> OLD.source_hash
    OR NEW.source_storage_key <> OLD.source_storage_key
    OR NEW.page_count <> OLD.page_count
    OR NEW.layout_strategy <> OLD.layout_strategy
    OR CAST(NEW.signer_plan_json AS CHAR) <> CAST(OLD.signer_plan_json AS CHAR)
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Published template versions are immutable';
  END IF;
END$$
DELIMITER ;

SET @ledger_version := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schema_migrations' AND COLUMN_NAME = 'version'
);
SET @ledger_sql := IF(
  @ledger_version > 0,
  'INSERT INTO schema_migrations (version, applied_at) SELECT ''006_template_editor'', UTC_TIMESTAMP(6) FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = ''006_template_editor'')',
  'DO 0'
);
PREPARE engage_ledger FROM @ledger_sql;
EXECUTE engage_ledger;
DEALLOCATE PREPARE engage_ledger;
