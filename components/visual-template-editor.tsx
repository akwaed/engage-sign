'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nudgeBox, snapBox, type PdfPointBox } from '@/lib/pdf-geometry';

const PALETTE = [
  ['text', 'Text', 180, 22],
  ['multiline', 'Paragraph', 220, 64],
  ['checkbox', 'Checkbox', 16, 16],
  ['radio', 'Choice', 16, 16],
  ['dropdown', 'Dropdown', 180, 22],
  ['signature', 'Signature', 180, 48],
  ['initials', 'Initials', 72, 28],
  ['date', 'Date', 120, 22],
  ['email', 'Email', 200, 22],
  ['phone', 'Phone', 150, 22],
] as const;

type FieldType = (typeof PALETTE)[number][0];

export type EditorField = {
  fieldName: string;
  label: string;
  fieldType: FieldType;
  signerRole: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  optionsText: string;
  dateFormat: string;
  groupKey: string;
};

type PageSize = { width: number; height: number };

export function VisualTemplateEditor({
  versionId,
  name,
  lifecycle,
  roles,
  initialFields,
  canPublish,
}: {
  versionId: string;
  name: string;
  lifecycle: 'draft' | 'active' | 'retired';
  roles: string[];
  initialFields: EditorField[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const draft = lifecycle === 'draft';
  const [fields, setFields] = useState(initialFields);
  const [roleNames, setRoleNames] = useState(roles.length ? roles : ['signer']);
  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [previewRole, setPreviewRole] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [guides, setGuides] = useState<
    Array<{ page: number; axis: 'x' | 'y'; at: number }>
  >([]);
  const drag = useRef<{
    kind: 'move' | 'resize' | 'new';
    index: number;
    type?: FieldType;
    startX: number;
    startY: number;
    origin: EditorField | null;
  } | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const pdf = await pdfjs.getDocument({
        url: `/api/admin/templates/${versionId}/file`,
      }).promise;
      if (cancelled) return;
      const sizes: PageSize[] = [];
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const pdfPage = await pdf.getPage(number);
        const viewport = pdfPage.getViewport({ scale: 1 });
        sizes.push({ width: viewport.width, height: viewport.height });
        const canvas = document.getElementById(
          `pdf-page-${number}`,
        ) as HTMLCanvasElement | null;
        if (!canvas) continue;
        const scaled = pdfPage.getViewport({ scale: zoom });
        canvas.width = scaled.width;
        canvas.height = scaled.height;
        const context = canvas.getContext('2d');
        if (context)
          await pdfPage.render({
            canvas,
            canvasContext: context,
            viewport: scaled,
          }).promise;
      }
      if (!cancelled) setPageSizes(sizes);
    })().catch((error) => setMessage(String(error)));
    return () => {
      cancelled = true;
    };
  }, [versionId, zoom]);

  function update(index: number, patch: Partial<EditorField>) {
    setFields((current) =>
      current.map((field, position) =>
        position === index ? { ...field, ...patch } : field,
      ),
    );
  }

  function pageAt(clientX: number, clientY: number) {
    for (let index = 0; index < pageRefs.current.length; index += 1) {
      const element = pageRefs.current[index];
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        const size = pageSizes[index];
        if (!size) return null;
        return {
          page: index + 1,
          x: ((clientX - rect.left) / rect.width) * size.width,
          y: ((clientY - rect.top) / rect.height) * size.height,
          size,
        };
      }
    }
    return null;
  }

  function onPointerDown(
    event: React.PointerEvent,
    index: number,
    kind: 'move' | 'resize',
  ) {
    if (!draft || previewRole) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      kind,
      index,
      startX: event.clientX,
      startY: event.clientY,
      origin: fields[index],
    };
    setSelected(index);
  }

  function onPointerMove(event: React.PointerEvent) {
    const active = drag.current;
    if (!active?.origin) return;
    const hit = pageAt(event.clientX, event.clientY);
    if (!hit) return;
    if (active.kind === 'new' && active.type) return;
    const origin = active.origin;
    const dx =
      ((event.clientX - active.startX) /
        (pageRefs.current[origin.pageNumber - 1]?.getBoundingClientRect()
          .width ?? 1)) *
      hit.size.width;
    const dy =
      ((event.clientY - active.startY) /
        (pageRefs.current[origin.pageNumber - 1]?.getBoundingClientRect()
          .height ?? 1)) *
      hit.size.height;
    if (active.kind === 'resize') {
      update(active.index, {
        width: Math.max(8, origin.width + dx),
        height: Math.max(8, origin.height + dy),
      });
      return;
    }
    const moved: PdfPointBox = {
      page: origin.pageNumber,
      x: origin.x + dx,
      y: origin.y + dy,
      width: origin.width,
      height: origin.height,
    };
    const snapped = snapBox(
      moved,
      fields
        .filter((_, position) => position !== active.index)
        .map((field) => ({
          page: field.pageNumber,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
        })),
      hit.size,
    );
    setGuides(
      snapped.guides.map((guide) => ({ ...guide, page: origin.pageNumber })),
    );
    update(active.index, {
      x: snapped.box.x,
      y: snapped.box.y,
      pageNumber: hit.page,
    });
  }

  function onPointerUp(event: React.PointerEvent) {
    const active = drag.current;
    drag.current = null;
    setGuides([]);
    if (!draft || !active || active.kind !== 'new' || !active.type) return;
    const hit = pageAt(event.clientX, event.clientY);
    if (!hit) return;
    const preset = PALETTE.find((item) => item[0] === active.type)!;
    const field = newField(
      active.type,
      fields.length + 1,
      roleNames[0] ?? 'signer',
      hit.page,
      hit.x,
      hit.y,
      preset[2],
      preset[3],
    );
    setFields((current) => [...current, field]);
    setSelected(fields.length);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!draft || previewRole) return;
    const field = fields[selected];
    const size = pageSizes[field?.pageNumber - 1];
    if (!field || !size) return;
    if (
      !event.key.startsWith('Arrow') &&
      event.key !== 'Delete' &&
      event.key !== 'Backspace'
    )
      return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    )
      return;
    event.preventDefault();
    if (event.key === 'Delete' || event.key === 'Backspace') {
      setFields((current) => current.filter((_, index) => index !== selected));
      return;
    }
    const next = nudgeBox(
      {
        page: field.pageNumber,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
      },
      event.key,
      event.shiftKey,
      event.altKey,
      size,
    );
    update(selected, next);
  }

  async function save(action: 'map' | 'duplicate' | 'activate') {
    setBusy(true);
    setMessage('');
    const form = new FormData();
    form.set('action', action);
    form.set('versionId', versionId);
    if (action === 'map') {
      form.set(
        'fields',
        JSON.stringify({
          coordinateSpace: 'pdf_points',
          signerPlan: roleNames.map((role, index) => ({
            role,
            order: index + 1,
            required: true,
          })),
          fields: fields.map((field) => ({
            fieldName: field.fieldName,
            label: field.label,
            fieldType: field.fieldType,
            populatedBy: 'signer',
            signerRole: field.signerRole,
            pageNumber: field.pageNumber,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
            required: field.required,
            groupKey: field.groupKey || null,
            dateFormat: field.dateFormat || null,
            options: field.optionsText
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          })),
        }),
      );
    }
    try {
      const response = await fetch('/api/admin/templates', {
        method: 'POST',
        body: form,
      });
      const body = (await response.json()) as {
        error?: string;
        versionId?: string;
      };
      if (!response.ok) throw new Error(body.error ?? 'Could not save.');
      if (body.versionId && body.versionId !== versionId) {
        router.push(`/admin/templates/${body.versionId}`);
        return;
      }
      setMessage(
        action === 'activate'
          ? 'Published. This version can no longer be edited.'
          : 'Draft saved.',
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const current = fields[selected];
  const visible = previewRole
    ? fields.filter((field) => field.signerRole === previewRole)
    : fields;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
      <aside className="rounded-xl border bg-white p-3">
        <p className="px-1 text-sm font-semibold">Add a field</p>
        <p className="mt-1 px-1 text-xs text-muted-foreground">
          Drag a field onto the page.
        </p>
        <div className="mt-3 space-y-2">
          {PALETTE.map(([type, label]) => (
            <button
              key={type}
              type="button"
              disabled={!draft || Boolean(previewRole)}
              className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-orange-50 disabled:opacity-40"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  kind: 'new',
                  index: -1,
                  type,
                  startX: event.clientX,
                  startY: event.clientY,
                  origin: null,
                };
              }}
              onPointerUp={onPointerUp}
            >
              {label}
            </button>
          ))}
        </div>
      </aside>
      <section className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link href="/admin/templates" className="text-sm underline">
            All templates
          </Link>
          <span className="text-sm text-muted-foreground">{name}</span>
          <span className="rounded-full bg-white px-2 py-1 text-xs">
            {lifecycle}
          </span>
          {[0.75, 1, 1.25, 1.5].map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={zoom === value ? 'default' : 'outline'}
              onClick={() => setZoom(value)}
            >
              {Math.round(value * 100)}%
            </Button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm">
            Preview as
            <select
              className="rounded border bg-white px-2 py-1"
              value={previewRole}
              onChange={(event) => setPreviewRole(event.target.value)}
            >
              <option value="">Editor</option>
              {roleNames.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!draft ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            This version is published and locked. Duplicate it to make changes.
          </p>
        ) : null}
        <div
          className="max-h-[80vh] space-y-6 overflow-auto rounded-xl bg-stone-200 p-4"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {pageSizes.map((size, index) => (
            <div
              key={index}
              ref={(element) => {
                pageRefs.current[index] = element;
              }}
              className="relative mx-auto bg-white shadow"
              style={{ width: size.width * zoom, height: size.height * zoom }}
            >
              <canvas
                id={`pdf-page-${index + 1}`}
                className="block h-full w-full"
              />
              {visible
                .map((field, fieldIndex) => ({ field, fieldIndex }))
                .filter(({ field }) => field.pageNumber === index + 1)
                .map(({ field, fieldIndex }) => (
                  <button
                    key={field.fieldName}
                    type="button"
                    aria-label={`${field.label}, ${field.fieldType}, page ${field.pageNumber}`}
                    className={`absolute border-2 text-left text-[10px] ${
                      fieldIndex === selected
                        ? 'border-orange-600 bg-orange-100/40'
                        : 'border-sky-700 bg-sky-100/30'
                    }`}
                    style={{
                      left: `${(field.x / size.width) * 100}%`,
                      top: `${(field.y / size.height) * 100}%`,
                      width: `${(field.width / size.width) * 100}%`,
                      height: `${(field.height / size.height) * 100}%`,
                    }}
                    onPointerDown={(event) =>
                      onPointerDown(event, fieldIndex, 'move')
                    }
                    onKeyDown={onKeyDown}
                  >
                    <span className="bg-white/80 px-1">{field.label}</span>
                    <span
                      className="absolute right-0 bottom-0 size-2 cursor-se-resize bg-orange-600"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        onPointerDown(event, fieldIndex, 'resize');
                      }}
                    />
                  </button>
                ))}
              {guides
                .filter((guide) => guide.page === index + 1)
                .map((guide, guideIndex) => (
                  <span
                    key={guideIndex}
                    className="pointer-events-none absolute bg-orange-500"
                    style={
                      guide.axis === 'x'
                        ? {
                            left: `${(guide.at / size.width) * 100}%`,
                            top: 0,
                            width: 1,
                            height: '100%',
                          }
                        : {
                            top: `${(guide.at / size.height) * 100}%`,
                            left: 0,
                            height: 1,
                            width: '100%',
                          }
                    }
                  />
                ))}
            </div>
          ))}
        </div>
      </section>
      <aside className="space-y-4 rounded-xl border bg-white p-4">
        <div>
          <Label htmlFor="roles">Recipient roles</Label>
          <Input
            id="roles"
            disabled={!draft}
            value={roleNames.join(', ')}
            onChange={(event) =>
              setRoleNames(
                event.target.value
                  .split(',')
                  .map((role) => role.trim().toLowerCase().replace(/\s+/g, '_'))
                  .filter(Boolean),
              )
            }
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Arrow keys move the selected field. Shift moves faster. Alt resizes.
          </p>
        </div>
        {current ? (
          <div className="space-y-2">
            <Label htmlFor="field-label">Label</Label>
            <Input
              id="field-label"
              disabled={!draft}
              value={current.label}
              onChange={(event) =>
                update(selected, { label: event.target.value })
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!draft}
                checked={current.required}
                onChange={(event) =>
                  update(selected, { required: event.target.checked })
                }
              />
              Required
            </label>
            <Label htmlFor="field-role">Recipient role</Label>
            <select
              id="field-role"
              className="w-full rounded border px-2 py-2 text-sm"
              disabled={!draft}
              value={current.signerRole}
              onChange={(event) =>
                update(selected, { signerRole: event.target.value })
              }
            >
              {roleNames.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {current.fieldType === 'date' ? (
              <>
                <Label htmlFor="date-format">Date format</Label>
                <select
                  id="date-format"
                  className="w-full rounded border px-2 py-2 text-sm"
                  disabled={!draft}
                  value={current.dateFormat}
                  onChange={(event) =>
                    update(selected, { dateFormat: event.target.value })
                  }
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                </select>
              </>
            ) : null}
            {current.fieldType === 'dropdown' ||
            current.fieldType === 'radio' ? (
              <>
                <Label htmlFor="choices">Choices, one per line</Label>
                <textarea
                  id="choices"
                  className="min-h-24 w-full rounded border px-2 py-2 text-sm"
                  disabled={!draft}
                  value={current.optionsText}
                  onChange={(event) =>
                    update(selected, { optionsText: event.target.value })
                  }
                />
                {current.fieldType === 'radio' ? (
                  <>
                    <Label htmlFor="group">Choice group</Label>
                    <Input
                      id="group"
                      disabled={!draft}
                      value={current.groupKey}
                      onChange={(event) =>
                        update(selected, { groupKey: event.target.value })
                      }
                    />
                  </>
                ) : null}
              </>
            ) : null}
            {current.fieldType === 'email' || current.fieldType === 'phone' ? (
              <p className="text-xs text-muted-foreground">
                The signer must enter a valid {current.fieldType}.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a field to edit it.
          </p>
        )}
        {previewRole ? (
          <div className="rounded-lg bg-stone-50 p-3 text-sm">
            <p className="font-medium">Signer preview: {previewRole}</p>
            <ul className="mt-2 space-y-1">
              {visible.map((field) => (
                <li key={field.fieldName}>
                  {field.label}
                  {field.required ? ' (required)' : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {message ? <p className="text-sm text-red-700">{message}</p> : null}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            disabled={!draft || busy}
            onClick={() => void save('map')}
          >
            Save draft
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void save('duplicate')}
          >
            Duplicate as new draft
          </Button>
          <Button
            type="button"
            className="bg-[#ed6435] hover:bg-[#d9552a]"
            disabled={!draft || !canPublish || busy}
            onClick={() => void save('activate')}
          >
            {canPublish ? 'Publish' : 'Publish needs permission'}
          </Button>
        </div>
      </aside>
    </div>
  );
}

function newField(
  type: FieldType,
  count: number,
  role: string,
  page: number,
  x: number,
  y: number,
  width: number,
  height: number,
): EditorField {
  return {
    fieldName: `${type}_${count}`,
    label: type[0].toUpperCase() + type.slice(1),
    fieldType: type,
    signerRole: role,
    pageNumber: page,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width,
    height,
    required: type === 'signature' || type === 'initials',
    optionsText: type === 'radio' || type === 'dropdown' ? 'Yes\nNo' : '',
    dateFormat: type === 'date' ? 'YYYY-MM-DD' : '',
    groupKey: type === 'radio' ? 'choice' : '',
  };
}
