ALTER TABLE `field_values` ADD `encryption_key_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `signature_events` ADD `encryption_key_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `signers` ADD `encryption_key_version` integer DEFAULT 1 NOT NULL;