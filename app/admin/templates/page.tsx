import type { RowDataPacket } from 'mysql2/promise';

import {
  TemplateManager,
  type TemplateVersionView,
} from '@/components/template-manager';
import { requireAdmin } from '@/lib/auth/session';
import { getMysqlPool } from '@/lib/mysql';
import { templateCatalog } from '@/lib/template-catalog';

export const dynamic = 'force-dynamic';

type VersionRow = RowDataPacket & {
  id: string;
  slug: string;
  version_number: number;
  source_hash: string;
  page_count: number;
  lifecycle: 'draft' | 'active' | 'retired';
  created_at: string;
};
type FieldRow = RowDataPacket & {
  template_version_id: string;
  field_name: string;
  label: string;
  field_type: TemplateVersionView['fields'][number]['fieldType'];
  populated_by: 'admin' | 'participant' | 'signer' | 'system';
  signer_role: string;
  page_number: number | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  required: number;
};

export default async function TemplatesPage() {
  await requireAdmin('/admin/templates');
  const pool = getMysqlPool();
  const [[versions], [fields]] = await Promise.all([
    pool.query<VersionRow[]>(
      `SELECT v.id, t.slug, v.version_number, v.source_hash, v.page_count,
              v.lifecycle, v.created_at
       FROM template_versions v JOIN templates t ON t.id = v.template_id
       ORDER BY t.slug, v.version_number DESC`,
    ),
    pool.query<FieldRow[]>(
      `SELECT template_version_id, field_name, label, field_type, populated_by,
              signer_role, page_number, x, y, width, height, required
       FROM template_fields ORDER BY display_order`,
    ),
  ]);
  const view: TemplateVersionView[] = versions.map((version) => ({
    id: version.id,
    slug: version.slug,
    versionNumber: version.version_number,
    sourceHash: version.source_hash,
    pageCount: version.page_count,
    lifecycle: version.lifecycle,
    createdAt: String(version.created_at),
    fields: fields
      .filter((field) => field.template_version_id === version.id)
      .map((field) => ({
        fieldName: field.field_name,
        label: field.label,
        fieldType: field.field_type,
        populatedBy:
          field.populated_by === 'admin'
            ? 'admin-fill'
            : field.populated_by === 'participant'
              ? 'participant-fill'
              : field.populated_by,
        signerRole: field.signer_role,
        pageNumber: field.page_number,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        required: Boolean(field.required),
      })),
  }));
  return <TemplateManager catalog={templateCatalog} versions={view} />;
}
