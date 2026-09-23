-- Apply after 001_template_lifecycle.sql, with a verified database backup.
ALTER TABLE envelopes
  MODIFY COLUMN status ENUM('draft', 'sent', 'viewed', 'partially_signed', 'completed', 'declined', 'expired', 'voided') NOT NULL,
  ADD COLUMN routing_mode ENUM('ordered', 'parallel') NOT NULL DEFAULT 'ordered' AFTER status,
  ADD COLUMN reminder_schedule_json JSON NULL AFTER routing_mode,
  ADD COLUMN locked_at DATETIME(6) NULL AFTER reminder_schedule_json;

UPDATE envelopes SET reminder_schedule_json = JSON_ARRAY(7, 3, 1)
 WHERE reminder_schedule_json IS NULL;

ALTER TABLE envelopes MODIFY COLUMN reminder_schedule_json JSON NOT NULL;

ALTER TABLE signers
  ADD COLUMN is_required BOOLEAN NOT NULL DEFAULT TRUE AFTER routing_order,
  ADD COLUMN token_used_at DATETIME(6) NULL AFTER token_expires_at,
  ADD COLUMN notified_at DATETIME(6) NULL AFTER token_used_at;

ALTER TABLE field_values
  ADD UNIQUE KEY field_values_envelope_field_unique (envelope_id, template_field_id);

ALTER TABLE signature_events
  ADD COLUMN submission_hash CHAR(64) NULL AFTER consent_text_version,
  ADD UNIQUE KEY signature_events_signer_unique (signer_id);

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
  sent_at DATETIME(6) NULL,
  UNIQUE KEY notification_outbox_once (signer_id, notification_type),
  KEY notification_outbox_status_idx (status, created_at),
  CONSTRAINT notification_outbox_signer_fk FOREIGN KEY (signer_id) REFERENCES signers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
