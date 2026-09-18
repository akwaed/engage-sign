CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`envelope_id` text,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`event_type` text NOT NULL,
	`details_json` text NOT NULL,
	`ip_address_encrypted` text,
	`user_agent` text,
	`occurred_at` text NOT NULL,
	`previous_hash` text,
	`event_hash` text NOT NULL,
	FOREIGN KEY (`envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_event_hash_unique` ON `audit_events` (`event_hash`);--> statement-breakpoint
CREATE INDEX `audit_events_envelope_idx` ON `audit_events` (`envelope_id`);--> statement-breakpoint
CREATE INDEX `audit_events_time_idx` ON `audit_events` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`envelope_id` text NOT NULL,
	`version_kind` text NOT NULL,
	`source_hash` text,
	`document_hash` text NOT NULL,
	`storage_key` text NOT NULL,
	`byte_length` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_versions_envelope_idx` ON `document_versions` (`envelope_id`);--> statement-breakpoint
CREATE INDEX `document_versions_hash_idx` ON `document_versions` (`document_hash`);--> statement-breakpoint
CREATE TABLE `envelopes` (
	`id` text PRIMARY KEY NOT NULL,
	`template_version_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` text,
	`completed_at` text,
	`retention_until` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`template_version_id`) REFERENCES `template_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `envelopes_status_idx` ON `envelopes` (`status`);--> statement-breakpoint
CREATE INDEX `envelopes_created_at_idx` ON `envelopes` (`created_at`);--> statement-breakpoint
CREATE TABLE `field_values` (
	`id` text PRIMARY KEY NOT NULL,
	`envelope_id` text NOT NULL,
	`template_field_id` text NOT NULL,
	`signer_id` text,
	`encrypted_value` text NOT NULL,
	`value_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_field_id`) REFERENCES `template_fields`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signer_id`) REFERENCES `signers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `field_values_envelope_idx` ON `field_values` (`envelope_id`);--> statement-breakpoint
CREATE TABLE `legal_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`created_by` text,
	`scope_json` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`archive_hash` text NOT NULL,
	`storage_key` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `legal_exports_created_at_idx` ON `legal_exports` (`created_at`);--> statement-breakpoint
CREATE TABLE `signature_events` (
	`id` text PRIMARY KEY NOT NULL,
	`envelope_id` text NOT NULL,
	`signer_id` text NOT NULL,
	`signature_method` text NOT NULL,
	`signature_storage_key` text NOT NULL,
	`presented_document_hash` text NOT NULL,
	`ip_address_encrypted` text NOT NULL,
	`user_agent` text NOT NULL,
	`consent_text_version` text NOT NULL,
	`signed_at` text NOT NULL,
	FOREIGN KEY (`envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signer_id`) REFERENCES `signers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `signature_events_envelope_idx` ON `signature_events` (`envelope_id`);--> statement-breakpoint
CREATE TABLE `signers` (
	`id` text PRIMARY KEY NOT NULL,
	`envelope_id` text NOT NULL,
	`signer_role` text NOT NULL,
	`name_encrypted` text NOT NULL,
	`email_encrypted` text NOT NULL,
	`routing_order` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_expires_at` text NOT NULL,
	`viewed_at` text,
	`signed_at` text,
	FOREIGN KEY (`envelope_id`) REFERENCES `envelopes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signers_token_hash_unique` ON `signers` (`token_hash`);--> statement-breakpoint
CREATE INDEX `signers_envelope_idx` ON `signers` (`envelope_id`);--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`default_expiration_days` integer DEFAULT 14 NOT NULL,
	`reminder_schedule_json` text DEFAULT '[7,3,1]' NOT NULL,
	`retention_days` integer,
	`updated_by` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `template_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`template_version_id` text NOT NULL,
	`field_name` text NOT NULL,
	`label` text NOT NULL,
	`field_type` text NOT NULL,
	`populated_by` text NOT NULL,
	`signer_role` text,
	`page_number` integer,
	`x` integer,
	`y` integer,
	`width` integer,
	`height` integer,
	`required` integer DEFAULT true NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`template_version_id`) REFERENCES `template_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `template_fields_version_idx` ON `template_fields` (`template_version_id`);--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`source_hash` text NOT NULL,
	`source_storage_key` text NOT NULL,
	`page_count` integer NOT NULL,
	`layout_strategy` text NOT NULL,
	`signer_plan_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_versions_number_unique` ON `template_versions` (`template_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `template_versions_template_idx` ON `template_versions` (`template_id`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`source_type` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_slug_unique` ON `templates` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);