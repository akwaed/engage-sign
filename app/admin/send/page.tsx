import type { RowDataPacket } from 'mysql2/promise';

import {
  SendDocumentForm,
  type SendTemplate,
} from '@/components/send-document-form';
import { requireAdmin } from '@/lib/auth/session';
import { decryptValue } from '@/lib/encryption';
import { getMysqlPool } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

type TemplateRow = RowDataPacket & {
  id: string;
  name: string;
  version_number: number;
  signer_plan_json:
    | string
    | Array<{ role: string; order: number; required: boolean }>;
};
type FieldRow = RowDataPacket & {
  template_version_id: string;
  field_name: string;
  label: string;
  field_type: string;
  required: number;
};

export default async function SendDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const actor = await requireAdmin('/admin/send');
  const { draft: draftId } = await searchParams;
  const [[versions], [fields], [settings]] = await Promise.all([
    getMysqlPool().query<TemplateRow[]>(
      `SELECT v.id, t.name, v.version_number, v.signer_plan_json
       FROM template_versions v JOIN templates t ON t.id = v.template_id
       WHERE v.lifecycle = 'active' ORDER BY t.name`,
    ),
    getMysqlPool().query<FieldRow[]>(
      `SELECT f.template_version_id, f.field_name, f.label, f.field_type, f.required
       FROM template_fields f JOIN template_versions v ON v.id = f.template_version_id
       WHERE v.lifecycle = 'active' AND f.populated_by = 'admin' ORDER BY f.display_order`,
    ),
    getMysqlPool().query<
      Array<
        RowDataPacket & {
          default_expiration_days: number;
          reminder_schedule_json: string | number[];
        }
      >
    >(
      "SELECT default_expiration_days, reminder_schedule_json FROM system_settings WHERE id = 'global'",
    ),
  ]);
  const templates: SendTemplate[] = versions.map((version) => ({
    id: version.id,
    name: version.name,
    versionNumber: version.version_number,
    signers:
      typeof version.signer_plan_json === 'string'
        ? JSON.parse(version.signer_plan_json)
        : version.signer_plan_json,
    adminFields: fields
      .filter((field) => field.template_version_id === version.id)
      .map((field) => ({
        name: field.field_name,
        label: field.label,
        type: field.field_type,
        required: Boolean(field.required),
      })),
  }));
  const defaults = settings[0];
  const reminderDays = defaults
    ? typeof defaults.reminder_schedule_json === 'string'
      ? JSON.parse(defaults.reminder_schedule_json)
      : defaults.reminder_schedule_json
    : [7, 3, 1];
  let initial:
    | {
        id: string;
        templateVersionId: string;
        title: string;
        routingMode: 'ordered' | 'parallel';
        expiresInDays: number;
        reminderDays: number[];
        adminValues: Record<string, string>;
        recipients: Record<
          string,
          { name: string; email: string; included: boolean }
        >;
      }
    | undefined;
  if (draftId && /^[a-f0-9-]{36}$/i.test(draftId)) {
    const [draftRows] = await getMysqlPool().query<
      Array<
        RowDataPacket & {
          id: string;
          template_version_id: string;
          title: string;
          routing_mode: 'ordered' | 'parallel';
          expires_at: string;
          days_left: number;
          reminder_schedule_json: string | number[];
        }
      >
    >(
      "SELECT *, CEIL(TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) / 86400) AS days_left FROM envelopes WHERE id = ? AND status = 'draft' AND created_by = ?",
      [draftId, actor.id],
    );
    const draft = draftRows[0];
    if (draft) {
      const [[signers], [values]] = await Promise.all([
        getMysqlPool().query<
          Array<
            RowDataPacket & {
              id: string;
              signer_role: string;
              name_encrypted: string;
              email_encrypted: string;
            }
          >
        >(
          'SELECT id, signer_role, name_encrypted, email_encrypted FROM signers WHERE envelope_id = ?',
          [draft.id],
        ),
        getMysqlPool().query<
          Array<
            RowDataPacket & {
              template_field_id: string;
              field_name: string;
              encrypted_value: string;
            }
          >
        >(
          `SELECT fv.template_field_id, tf.field_name, fv.encrypted_value
             FROM field_values fv JOIN template_fields tf ON tf.id = fv.template_field_id
             WHERE fv.envelope_id = ? AND tf.populated_by = 'admin'`,
          [draft.id],
        ),
      ]);
      initial = {
        id: draft.id,
        templateVersionId: draft.template_version_id,
        title: draft.title,
        routingMode: draft.routing_mode,
        expiresInDays: Math.max(1, draft.days_left),
        reminderDays:
          typeof draft.reminder_schedule_json === 'string'
            ? JSON.parse(draft.reminder_schedule_json)
            : draft.reminder_schedule_json,
        adminValues: Object.fromEntries(
          values.map((value) => [
            value.field_name,
            decryptValue(
              value.encrypted_value,
              `field:${draft.id}:${value.template_field_id}`,
            ),
          ]),
        ),
        recipients: Object.fromEntries(
          signers.map((signer) => [
            signer.signer_role,
            {
              name: decryptValue(
                signer.name_encrypted,
                `signer:${signer.id}:name`,
              ),
              email: decryptValue(
                signer.email_encrypted,
                `signer:${signer.id}:email`,
              ),
              included: true,
            },
          ]),
        ),
      };
    }
  }
  return (
    <SendDocumentForm
      templates={templates}
      defaultExpiration={defaults?.default_expiration_days ?? 14}
      defaultReminderDays={reminderDays}
      initial={initial}
    />
  );
}
