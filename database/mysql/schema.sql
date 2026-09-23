-- Engage Sign production schema for MySQL 8.0+
-- Store document bytes outside the public web root; storage_key columns contain private object paths only.

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  role ENUM('admin', 'staff') NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  password_hash VARCHAR(255) NOT NULL,
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(6) NULL,
  password_changed_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY users_email_unique (email),
  KEY users_status_role_idx (status, role)
) ENGINE=InnoDB;

CREATE TABLE staff_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  ip_hash CHAR(64) NULL,
  user_agent TEXT NULL,
  created_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  UNIQUE KEY staff_sessions_token_unique (token_hash),
  KEY staff_sessions_user_idx (user_id),
  KEY staff_sessions_expiration_idx (expires_at),
  CONSTRAINT staff_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE password_reset_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  used_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY password_reset_token_unique (token_hash),
  KEY password_reset_user_idx (user_id),
  CONSTRAINT password_reset_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE templates (
  id CHAR(36) PRIMARY KEY,
  slug VARCHAR(190) NOT NULL,
  name VARCHAR(255) NOT NULL,
  source_type ENUM('docx', 'pdf') NOT NULL,
  status ENUM('draft', 'review', 'active', 'archived') NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  UNIQUE KEY templates_slug_unique (slug),
  CONSTRAINT templates_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE template_versions (
  id CHAR(36) PRIMARY KEY,
  template_id CHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  source_hash CHAR(64) NOT NULL,
  source_storage_key VARCHAR(1024) NOT NULL,
  page_count INT UNSIGNED NOT NULL,
  layout_strategy ENUM('docx_merge', 'pdf_overlay', 'acroform') NOT NULL,
  signer_plan_json JSON NOT NULL,
  lifecycle ENUM('draft', 'active', 'retired') NOT NULL DEFAULT 'draft',
  activated_at DATETIME(6) NULL,
  retired_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY template_versions_number_unique (template_id, version_number),
  KEY template_versions_template_idx (template_id),
  CONSTRAINT template_versions_template_fk FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE template_fields (
  id CHAR(36) PRIMARY KEY,
  template_version_id CHAR(36) NOT NULL,
  field_name VARCHAR(190) NOT NULL,
  label VARCHAR(255) NOT NULL,
  field_type ENUM('text', 'date', 'checkbox', 'radio', 'initials', 'signature') NOT NULL,
  populated_by ENUM('admin', 'participant', 'signer', 'system') NOT NULL,
  signer_role VARCHAR(100) NULL,
  page_number INT UNSIGNED NULL,
  x INT NULL,
  y INT NULL,
  width INT NULL,
  height INT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  KEY template_fields_version_idx (template_version_id),
  CONSTRAINT template_fields_version_fk FOREIGN KEY (template_version_id) REFERENCES template_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE envelopes (
  id CHAR(36) PRIMARY KEY,
  template_version_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status ENUM('draft', 'sent', 'viewed', 'partially_signed', 'completed', 'declined', 'expired', 'voided') NOT NULL,
  routing_mode ENUM('ordered', 'parallel') NOT NULL DEFAULT 'ordered',
  reminder_schedule_json JSON NOT NULL,
  locked_at DATETIME(6) NULL,
  created_by CHAR(36) NOT NULL,
  expires_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  retention_until DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  KEY envelopes_status_idx (status),
  KEY envelopes_created_at_idx (created_at),
  CONSTRAINT envelopes_template_version_fk FOREIGN KEY (template_version_id) REFERENCES template_versions(id),
  CONSTRAINT envelopes_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE signers (
  id CHAR(36) PRIMARY KEY,
  envelope_id CHAR(36) NOT NULL,
  signer_role VARCHAR(100) NOT NULL,
  name_encrypted LONGTEXT NOT NULL,
  email_encrypted LONGTEXT NOT NULL,
  encryption_key_version INT UNSIGNED NOT NULL DEFAULT 1,
  routing_order INT UNSIGNED NOT NULL DEFAULT 1,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  status ENUM('pending', 'sent', 'viewed', 'signed', 'declined', 'expired') NOT NULL,
  token_hash CHAR(64) NOT NULL,
  token_expires_at DATETIME(6) NOT NULL,
  token_used_at DATETIME(6) NULL,
  notified_at DATETIME(6) NULL,
  viewed_at DATETIME(6) NULL,
  signed_at DATETIME(6) NULL,
  UNIQUE KEY signers_token_hash_unique (token_hash),
  KEY signers_envelope_idx (envelope_id),
  CONSTRAINT signers_envelope_fk FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE field_values (
  id CHAR(36) PRIMARY KEY,
  envelope_id CHAR(36) NOT NULL,
  template_field_id CHAR(36) NOT NULL,
  signer_id CHAR(36) NULL,
  encrypted_value LONGTEXT NOT NULL,
  encryption_key_version INT UNSIGNED NOT NULL DEFAULT 1,
  value_hash CHAR(64) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  KEY field_values_envelope_idx (envelope_id),
  UNIQUE KEY field_values_envelope_field_unique (envelope_id, template_field_id),
  CONSTRAINT field_values_envelope_fk FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE CASCADE,
  CONSTRAINT field_values_field_fk FOREIGN KEY (template_field_id) REFERENCES template_fields(id),
  CONSTRAINT field_values_signer_fk FOREIGN KEY (signer_id) REFERENCES signers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE document_versions (
  id CHAR(36) PRIMARY KEY,
  envelope_id CHAR(36) NOT NULL,
  version_kind ENUM('prepared', 'presented', 'intermediate', 'final', 'audit_certificate') NOT NULL,
  source_hash CHAR(64) NULL,
  document_hash CHAR(64) NOT NULL,
  storage_key VARCHAR(1024) NOT NULL,
  byte_length BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL,
  KEY document_versions_envelope_idx (envelope_id),
  KEY document_versions_hash_idx (document_hash),
  CONSTRAINT document_versions_envelope_fk FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE signer_sessions (
  id CHAR(36) PRIMARY KEY,
  signer_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  presented_document_id CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  UNIQUE KEY signer_sessions_token_unique (token_hash),
  KEY signer_sessions_signer_idx (signer_id),
  CONSTRAINT signer_sessions_signer_fk FOREIGN KEY (signer_id) REFERENCES signers(id) ON DELETE CASCADE,
  CONSTRAINT signer_sessions_document_fk FOREIGN KEY (presented_document_id) REFERENCES document_versions(id)
) ENGINE=InnoDB;

CREATE TABLE notification_outbox (
  id CHAR(36) PRIMARY KEY,
  signer_id CHAR(36) NOT NULL,
  notification_type VARCHAR(40) NOT NULL,
  status ENUM('pending', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  claimed_at DATETIME(6) NULL,
  next_attempt_at DATETIME(6) NULL,
  last_attempt_at DATETIME(6) NULL,
  sent_at DATETIME(6) NULL,
  provider_response VARCHAR(255) NULL,
  last_error_code VARCHAR(80) NULL,
  UNIQUE KEY notification_outbox_once (signer_id, notification_type),
  KEY notification_outbox_status_idx (status, created_at),
  KEY notification_outbox_retry_idx (status, next_attempt_at),
  CONSTRAINT notification_outbox_signer_fk FOREIGN KEY (signer_id) REFERENCES signers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE final_archives (
  id CHAR(36) PRIMARY KEY,
  envelope_id CHAR(36) NOT NULL,
  final_document_id CHAR(36) NOT NULL,
  final_document_hash CHAR(64) NOT NULL,
  certificate_hash CHAR(64) NOT NULL,
  archive_hash CHAR(64) NOT NULL,
  storage_key VARCHAR(1024) NOT NULL,
  byte_length BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL,
  UNIQUE KEY final_archives_envelope_unique (envelope_id),
  CONSTRAINT final_archives_envelope_fk FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE CASCADE,
  CONSTRAINT final_archives_document_fk FOREIGN KEY (final_document_id) REFERENCES document_versions(id)
) ENGINE=InnoDB;

CREATE TABLE signature_events (
  id CHAR(36) PRIMARY KEY,
  envelope_id CHAR(36) NOT NULL,
  signer_id CHAR(36) NOT NULL,
  signature_method ENUM('typed', 'drawn') NOT NULL,
  signature_storage_key VARCHAR(1024) NOT NULL,
  presented_document_hash CHAR(64) NOT NULL,
  ip_address_encrypted LONGTEXT NOT NULL,
  encryption_key_version INT UNSIGNED NOT NULL DEFAULT 1,
  user_agent TEXT NOT NULL,
  consent_text_version VARCHAR(100) NOT NULL,
  submission_hash CHAR(64) NOT NULL,
  signed_at DATETIME(6) NOT NULL,
  KEY signature_events_envelope_idx (envelope_id),
  UNIQUE KEY signature_events_signer_unique (signer_id),
  CONSTRAINT signature_events_envelope_fk FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE CASCADE,
  CONSTRAINT signature_events_signer_fk FOREIGN KEY (signer_id) REFERENCES signers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE audit_events (
  id CHAR(36) PRIMARY KEY,
  envelope_id CHAR(36) NULL,
  actor_type ENUM('system', 'user', 'signer') NOT NULL,
  actor_id CHAR(36) NULL,
  event_type VARCHAR(100) NOT NULL,
  details_json JSON NOT NULL,
  ip_address_encrypted LONGTEXT NULL,
  user_agent TEXT NULL,
  occurred_at DATETIME(6) NOT NULL,
  previous_hash CHAR(64) NULL,
  event_hash CHAR(64) NOT NULL,
  UNIQUE KEY audit_events_hash_unique (event_hash),
  KEY audit_events_envelope_idx (envelope_id),
  KEY audit_events_time_idx (occurred_at),
  CONSTRAINT audit_events_envelope_fk FOREIGN KEY (envelope_id) REFERENCES envelopes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE legal_exports (
  id CHAR(36) PRIMARY KEY,
  created_by CHAR(36) NULL,
  scope_json JSON NOT NULL,
  manifest_hash CHAR(64) NOT NULL,
  archive_hash CHAR(64) NOT NULL,
  storage_key VARCHAR(1024) NULL,
  created_at DATETIME(6) NOT NULL,
  KEY legal_exports_created_at_idx (created_at),
  CONSTRAINT legal_exports_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE system_settings (
  id VARCHAR(64) PRIMARY KEY,
  default_expiration_days INT UNSIGNED NOT NULL DEFAULT 14,
  reminder_schedule_json JSON NOT NULL,
  retention_days INT UNSIGNED NULL,
  updated_by CHAR(36) NULL,
  updated_at DATETIME(6) NOT NULL,
  CONSTRAINT system_settings_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO system_settings (
  id, default_expiration_days, reminder_schedule_json, retention_days, updated_by, updated_at
) VALUES (
  'global', 14, JSON_ARRAY(7, 3, 1), NULL, NULL, UTC_TIMESTAMP(6)
);

DELIMITER $$

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit events are append-only';
END$$

CREATE TRIGGER audit_events_guard_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
BEGIN
  IF COALESCE(@engage_retention_purge, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit events may only be deleted by the retention purge job';
  END IF;
END$$

CREATE TRIGGER document_versions_no_update
BEFORE UPDATE ON document_versions
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Archived document versions are immutable';
END$$

CREATE TRIGGER legal_exports_no_update
BEFORE UPDATE ON legal_exports
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Legal export records are immutable';
END$$

DELIMITER ;
