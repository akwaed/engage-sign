import type { RowDataPacket } from 'mysql2/promise';

import { getStaffUser } from '@/lib/auth/session';
import { convertDocxToPdf } from '@/lib/docx-convert';
import { getMysqlPool } from '@/lib/mysql';
import { readTemplateVersion } from '@/lib/private-storage';
import { assertSameOrigin } from '@/lib/request-security';
import {
  fillPdf,
  inspectTemplate,
  mergeDocx,
  sha256,
  type TemplateField,
} from '@/lib/template-files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Version = RowDataPacket & {
  source_hash: string;
  source_storage_key: string;
  layout_strategy: 'docx_merge' | 'pdf_overlay';
};
type FieldRow = RowDataPacket & {
  field_name: string;
  label: string;
  field_type: TemplateField['fieldType'];
  populated_by: 'admin' | 'participant' | 'signer' | 'system';
  signer_role: string;
  page_number: number | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  required: number;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  const actor = await getStaffUser();
  if (!actor || actor.role !== 'admin')
    return new Response('Forbidden', { status: 403 });
  try {
    const { versionId } = await context.params;
    const version = await loadVersion(versionId);
    const data = await checkedBytes(version);
    const render = new URL(request.url).searchParams.get('render') === 'pdf';
    const bytes =
      render && version.layout_strategy === 'docx_merge'
        ? await convertDocxToPdf(data)
        : data;
    return fileResponse(
      bytes,
      render || version.layout_strategy === 'pdf_overlay' ? 'pdf' : 'docx',
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Preview failed.' },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> },
) {
  try {
    assertSameOrigin(request);
  } catch {
    return new Response('Invalid origin', { status: 403 });
  }
  const actor = await getStaffUser();
  if (!actor || actor.role !== 'admin')
    return new Response('Forbidden', { status: 403 });
  try {
    const { versionId } = await context.params;
    const version = await loadVersion(versionId);
    const data = await checkedBytes(version);
    const body = (await request.json()) as { values?: Record<string, string> };
    if (
      !body.values ||
      typeof body.values !== 'object' ||
      Object.keys(body.values).length > 300
    )
      throw new Error('Provide test field values.');
    const [rows] = await getMysqlPool().query<FieldRow[]>(
      'SELECT * FROM template_fields WHERE template_version_id = ? ORDER BY display_order',
      [versionId],
    );
    const fields: TemplateField[] = rows.map((row) => ({
      fieldName: row.field_name,
      label: row.label,
      fieldType: row.field_type,
      populatedBy:
        row.populated_by === 'admin'
          ? 'admin-fill'
          : row.populated_by === 'participant'
            ? 'participant-fill'
            : row.populated_by,
      signerRole: row.signer_role,
      pageNumber: row.page_number,
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      required: Boolean(row.required),
    }));
    const values: Record<string, string> = {};
    for (const field of fields) {
      const value = body.values[field.fieldName];
      if (value !== undefined) {
        if (typeof value !== 'string' || value.length > 500)
          throw new Error(`Invalid test value for ${field.fieldName}.`);
        values[field.fieldName] = value;
      }
    }
    let pdf: Uint8Array;
    if (version.layout_strategy === 'docx_merge') {
      const inspection = await inspectTemplate(data, 'docx');
      for (const name of inspection.placeholders) values[name] ??= '';
      pdf = await convertDocxToPdf(mergeDocx(data, values));
    } else pdf = await fillPdf(data, fields, values);
    return fileResponse(pdf, 'pdf');
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Test fill failed.' },
      { status: 400 },
    );
  }
}

async function loadVersion(id: string) {
  const [rows] = await getMysqlPool().query<Version[]>(
    'SELECT source_hash, source_storage_key, layout_strategy FROM template_versions WHERE id = ? LIMIT 1',
    [id],
  );
  if (!rows[0]) throw new Error('Template version not found.');
  return rows[0];
}

async function checkedBytes(version: Version) {
  const bytes = await readTemplateVersion(version.source_storage_key);
  if (sha256(bytes) !== version.source_hash)
    throw new Error('Template source failed SHA-256 verification.');
  return bytes;
}

function fileResponse(data: Uint8Array, extension: 'pdf' | 'docx') {
  return new Response(Uint8Array.from(data).buffer, {
    headers: {
      'Content-Type':
        extension === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `inline; filename="template-preview.${extension}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
