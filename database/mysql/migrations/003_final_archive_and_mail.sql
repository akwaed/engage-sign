-- Apply after 002_signing_workflow.sql with a verified full database backup.
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

ALTER TABLE notification_outbox
  ADD COLUMN next_attempt_at DATETIME(6) NULL AFTER claimed_at,
  ADD COLUMN last_attempt_at DATETIME(6) NULL AFTER next_attempt_at,
  ADD COLUMN provider_response VARCHAR(255) NULL AFTER sent_at,
  ADD COLUMN last_error_code VARCHAR(80) NULL AFTER provider_response,
  ADD KEY notification_outbox_retry_idx (status, next_attempt_at);
