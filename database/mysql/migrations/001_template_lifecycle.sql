-- Apply once to installations created before template lifecycle support.
ALTER TABLE template_versions
  ADD COLUMN lifecycle ENUM('draft', 'active', 'retired') NOT NULL DEFAULT 'draft' AFTER signer_plan_json,
  ADD COLUMN activated_at DATETIME(6) NULL AFTER lifecycle,
  ADD COLUMN retired_at DATETIME(6) NULL AFTER activated_at;
