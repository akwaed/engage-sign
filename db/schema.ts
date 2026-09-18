import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['admin', 'staff'] }).notNull(),
  passwordHash: text('password_hash'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  sourceType: text('source_type', { enum: ['docx', 'pdf'] }).notNull(),
  status: text('status', {
    enum: ['draft', 'review', 'active', 'archived'],
  }).notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const templateVersions = sqliteTable(
  'template_versions',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => templates.id),
    versionNumber: integer('version_number').notNull(),
    sourceHash: text('source_hash').notNull(),
    sourceStorageKey: text('source_storage_key').notNull(),
    pageCount: integer('page_count').notNull(),
    layoutStrategy: text('layout_strategy', {
      enum: ['docx_merge', 'pdf_overlay', 'acroform'],
    }).notNull(),
    signerPlanJson: text('signer_plan_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('template_versions_number_unique').on(
      table.templateId,
      table.versionNumber,
    ),
    index('template_versions_template_idx').on(table.templateId),
  ],
);

export const templateFields = sqliteTable(
  'template_fields',
  {
    id: text('id').primaryKey(),
    templateVersionId: text('template_version_id')
      .notNull()
      .references(() => templateVersions.id),
    fieldName: text('field_name').notNull(),
    label: text('label').notNull(),
    fieldType: text('field_type', {
      enum: ['text', 'date', 'checkbox', 'radio', 'initials', 'signature'],
    }).notNull(),
    populatedBy: text('populated_by', {
      enum: ['admin', 'participant', 'signer', 'system'],
    }).notNull(),
    signerRole: text('signer_role'),
    pageNumber: integer('page_number'),
    x: integer('x'),
    y: integer('y'),
    width: integer('width'),
    height: integer('height'),
    required: integer('required', { mode: 'boolean' }).notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (table) => [index('template_fields_version_idx').on(table.templateVersionId)],
);

export const envelopes = sqliteTable(
  'envelopes',
  {
    id: text('id').primaryKey(),
    templateVersionId: text('template_version_id')
      .notNull()
      .references(() => templateVersions.id),
    title: text('title').notNull(),
    status: text('status', {
      enum: [
        'draft',
        'sent',
        'partially_signed',
        'completed',
        'declined',
        'expired',
        'voided',
      ],
    }).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    expiresAt: text('expires_at'),
    completedAt: text('completed_at'),
    retentionUntil: text('retention_until'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('envelopes_status_idx').on(table.status),
    index('envelopes_created_at_idx').on(table.createdAt),
  ],
);

export const signers = sqliteTable(
  'signers',
  {
    id: text('id').primaryKey(),
    envelopeId: text('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    signerRole: text('signer_role').notNull(),
    nameEncrypted: text('name_encrypted').notNull(),
    emailEncrypted: text('email_encrypted').notNull(),
    encryptionKeyVersion: integer('encryption_key_version')
      .notNull()
      .default(1),
    routingOrder: integer('routing_order').notNull().default(1),
    status: text('status', {
      enum: ['pending', 'sent', 'viewed', 'signed', 'declined', 'expired'],
    }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenExpiresAt: text('token_expires_at').notNull(),
    viewedAt: text('viewed_at'),
    signedAt: text('signed_at'),
  },
  (table) => [index('signers_envelope_idx').on(table.envelopeId)],
);

export const fieldValues = sqliteTable(
  'field_values',
  {
    id: text('id').primaryKey(),
    envelopeId: text('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    templateFieldId: text('template_field_id')
      .notNull()
      .references(() => templateFields.id),
    signerId: text('signer_id').references(() => signers.id),
    encryptedValue: text('encrypted_value').notNull(),
    encryptionKeyVersion: integer('encryption_key_version')
      .notNull()
      .default(1),
    valueHash: text('value_hash').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('field_values_envelope_idx').on(table.envelopeId)],
);

export const documentVersions = sqliteTable(
  'document_versions',
  {
    id: text('id').primaryKey(),
    envelopeId: text('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    versionKind: text('version_kind', {
      enum: [
        'prepared',
        'presented',
        'intermediate',
        'final',
        'audit_certificate',
      ],
    }).notNull(),
    sourceHash: text('source_hash'),
    documentHash: text('document_hash').notNull(),
    storageKey: text('storage_key').notNull(),
    byteLength: integer('byte_length').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('document_versions_envelope_idx').on(table.envelopeId),
    index('document_versions_hash_idx').on(table.documentHash),
  ],
);

export const signatureEvents = sqliteTable(
  'signature_events',
  {
    id: text('id').primaryKey(),
    envelopeId: text('envelope_id')
      .notNull()
      .references(() => envelopes.id),
    signerId: text('signer_id')
      .notNull()
      .references(() => signers.id),
    signatureMethod: text('signature_method', {
      enum: ['typed', 'drawn'],
    }).notNull(),
    signatureStorageKey: text('signature_storage_key').notNull(),
    presentedDocumentHash: text('presented_document_hash').notNull(),
    ipAddressEncrypted: text('ip_address_encrypted').notNull(),
    encryptionKeyVersion: integer('encryption_key_version')
      .notNull()
      .default(1),
    userAgent: text('user_agent').notNull(),
    consentTextVersion: text('consent_text_version').notNull(),
    signedAt: text('signed_at').notNull(),
  },
  (table) => [index('signature_events_envelope_idx').on(table.envelopeId)],
);

export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    envelopeId: text('envelope_id').references(() => envelopes.id),
    actorType: text('actor_type', {
      enum: ['system', 'user', 'signer'],
    }).notNull(),
    actorId: text('actor_id'),
    eventType: text('event_type').notNull(),
    detailsJson: text('details_json').notNull(),
    ipAddressEncrypted: text('ip_address_encrypted'),
    userAgent: text('user_agent'),
    occurredAt: text('occurred_at').notNull(),
    previousHash: text('previous_hash'),
    eventHash: text('event_hash').notNull().unique(),
  },
  (table) => [
    index('audit_events_envelope_idx').on(table.envelopeId),
    index('audit_events_time_idx').on(table.occurredAt),
  ],
);

export const legalExports = sqliteTable(
  'legal_exports',
  {
    id: text('id').primaryKey(),
    createdBy: text('created_by').references(() => users.id),
    scopeJson: text('scope_json').notNull(),
    manifestHash: text('manifest_hash').notNull(),
    archiveHash: text('archive_hash').notNull(),
    storageKey: text('storage_key'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('legal_exports_created_at_idx').on(table.createdAt)],
);

export const systemSettings = sqliteTable('system_settings', {
  id: text('id').primaryKey(),
  defaultExpirationDays: integer('default_expiration_days')
    .notNull()
    .default(14),
  reminderScheduleJson: text('reminder_schedule_json')
    .notNull()
    .default('[7,3,1]'),
  retentionDays: integer('retention_days'),
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: text('updated_at').notNull(),
});
