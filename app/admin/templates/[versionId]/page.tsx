import { notFound } from 'next/navigation';
import type { RowDataPacket } from 'mysql2/promise';

import {
  VisualTemplateEditor,
  type EditorField,
} from '@/components/visual-template-editor';
import { canEditTemplates, canPublishTemplates } from '@/lib/auth/rbac';
import { requireUser } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

type VersionRow = RowDataPacket & {
  id: string;
  name: string;
  lifecycle: 'draft' | 'active' | 'retired';
  signer_plan_json: string | Array<{ role: string }>;
  source_type: string;
};
type FieldRow = RowDataPacket & {
  field_name: string;
  label: string;
  field_type: EditorField['fieldType'];
  signer_role: string;
  page_number: number | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  required: number;
  group_key: string | null;
  options_json: string | string[] | null;
  date_format: string | null;
};

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(versionId)) notFound();
  const user = await requireUser(
    `/admin/templates/${versionId}`,
    canEditTemplates,
  );
  const [versions] = await getMysqlPool().query<VersionRow[]>(
    `SELECT v.id, t.name, v.lifecycle, v.signer_plan_json, t.source_type
       FROM template_versions v JOIN templates t ON t.id = v.template_id
      WHERE v.id = ? LIMIT 1`,
    [versionId],
  );
  const version = versions[0];
  if (!version || version.source_type !== 'pdf') notFound();
  const plan =
    typeof version.signer_plan_json === 'string'
      ? (JSON.parse(version.signer_plan_json) as Array<{ role: string }>)
      : version.signer_plan_json;
  const [fields] = await getMysqlPool().query<FieldRow[]>(
    `SELECT field_name, label, field_type, signer_role, page_number, x, y, width, height,
            required, group_key, options_json, date_format
       FROM template_fields WHERE template_version_id = ? ORDER BY display_order`,
    [versionId],
  );
  const initialFields: EditorField[] = fields
    .filter((field) => field.page_number && field.x !== null)
    .map((field) => ({
      fieldName: field.field_name,
      label: field.label,
      fieldType: field.field_type,
      signerRole: field.signer_role,
      pageNumber: Number(field.page_number),
      x: Number(field.x),
      y: Number(field.y),
      width: Number(field.width),
      height: Number(field.height),
      required: Boolean(field.required),
      optionsText: optionsText(field.options_json),
      dateFormat: field.date_format ?? '',
      groupKey: field.group_key ?? '',
    }));
  return (
    <main className="min-h-screen bg-[#f7f5f2] px-4 py-6 sm:px-6">
      <VisualTemplateEditor
        versionId={version.id}
        name={version.name}
        lifecycle={version.lifecycle}
        roles={plan.map((item) => item.role)}
        initialFields={initialFields}
        canPublish={canPublishTemplates(user)}
      />
    </main>
  );
}

function optionsText(value: FieldRow['options_json']) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.join('\n') : '';
}
