'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import type { TemplateCatalogItem } from '@/lib/template-catalog';
import type { TemplateField } from '@/lib/template-files';

export type TemplateVersionView = {
  id: string;
  slug: string;
  versionNumber: number;
  sourceHash: string;
  pageCount: number;
  lifecycle: 'draft' | 'active' | 'retired';
  createdAt: string;
  fields: TemplateField[];
};

export function TemplateManager({
  catalog,
  versions,
}: {
  catalog: TemplateCatalogItem[];
  versions: TemplateVersionView[];
}) {
  const [slug, setSlug] = useState(catalog[0].id);
  const item = catalog.find((entry) => entry.id === slug)!;
  const available = versions.filter((version) => version.slug === slug);
  const [selectedId, setSelectedId] = useState('');
  const selected =
    available.find((version) => version.id === selectedId) ?? available[0];
  const previewVersionId = selected?.id;
  const [fields, setFields] = useState<TemplateField[]>(selected?.fields ?? []);
  const [selectedField, setSelectedField] = useState(0);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [testUrl, setTestUrl] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!previewVersionId || item.sourceType !== 'pdf' || !canvas.current)
      return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const task = pdfjs.getDocument({
        url: `/api/admin/templates/${previewVersionId}/file`,
      });
      cleanup = () => {
        void task.destroy();
      };
      const pdf = await task.promise;
      if (cancelled) return;
      const pdfPage = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 1.3 });
      const element = canvas.current;
      if (!element) return;
      element.width = viewport.width;
      element.height = viewport.height;
      const context = element.getContext('2d');
      if (!context) return;
      await pdfPage.render({
        canvas: element,
        canvasContext: context,
        viewport,
      }).promise;
    })().catch((error) => {
      if (!cancelled) setMessage(`PDF preview: ${String(error)}`);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [previewVersionId, page, item.sourceType]);

  function selectVersion(id: string, source = available) {
    const version = source.find((entry) => entry.id === id);
    setSelectedId(id);
    setFields(version?.fields ?? []);
    setSelectedField(0);
    setPage(1);
    setValues({});
    setTestUrl('');
  }

  async function submit(form: FormData) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/templates', {
        method: 'POST',
        body: form,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Request failed.');
      setMessage('Saved. Reloading template data…');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  }

  function update(index: number, patch: Partial<TemplateField>) {
    setFields((current) =>
      current.map((field, position) =>
        position === index ? { ...field, ...patch } : field,
      ),
    );
  }

  function addField() {
    setFields((current) => [
      ...current,
      {
        fieldName: '',
        label: '',
        fieldType: 'text',
        populatedBy: 'signer',
        signerRole: item.signers[0].role,
        pageNumber: item.sourceType === 'pdf' ? page : null,
        x: item.sourceType === 'pdf' ? 100 : null,
        y: item.sourceType === 'pdf' ? 100 : null,
        width: item.sourceType === 'pdf' ? 200 : null,
        height: item.sourceType === 'pdf' ? 40 : null,
        required: true,
      },
    ]);
    setSelectedField(fields.length);
  }

  async function testFill() {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/templates/${selected.id}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? 'Test fill failed.');
      }
      if (testUrl) URL.revokeObjectURL(testUrl);
      const url = URL.createObjectURL(await response.blob());
      setTestUrl(url);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Test fill failed.');
    } finally {
      setBusy(false);
    }
  }

  const fileUrl = selected ? `/api/admin/templates/${selected.id}/file` : '';
  return (
    <main className="min-h-screen bg-[#f7f5f2] px-5 py-8 text-[#2c2028] sm:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="text-sm text-stone-600 hover:underline">
          ← Back to dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Template management</h1>
            <p className="mt-2 max-w-2xl text-sm text-stone-600">
              Import original files, map fields to signer roles, preview and
              test each version, then activate it.
            </p>
          </div>
          <span className="rounded-full border bg-white px-3 py-1 text-xs">
            Administrator only
          </span>
        </div>
        {message && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"
          >
            {message}
          </p>
        )}
        <div className="mt-6 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-xl border bg-white p-3">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
              Nine baseline forms
            </p>
            {catalog.map((entry) => {
              const entryVersions = versions.filter(
                (version) => version.slug === entry.id,
              );
              const active = entryVersions.find(
                (version) => version.lifecycle === 'active',
              );
              return (
                <button
                  type="button"
                  key={entry.id}
                  onClick={() => {
                    setSlug(entry.id);
                    selectVersion(entryVersions[0]?.id ?? '', entryVersions);
                    setMessage('');
                  }}
                  className={`mb-1 w-full rounded-lg px-3 py-3 text-left text-sm ${slug === entry.id ? 'bg-orange-100' : 'hover:bg-stone-100'}`}
                >
                  <span className="block font-medium">{entry.name}</span>
                  <span className="mt-1 block text-xs text-stone-500">
                    {entryVersions.length
                      ? `${entryVersions.length} version(s) · ${active ? `active v${active.versionNumber}` : 'no active version'}`
                      : 'Not imported'}
                  </span>
                </button>
              );
            })}
          </aside>
          <div className="space-y-5">
            <section className="rounded-xl border bg-white p-5">
              <h2 className="text-xl font-semibold">{item.name}</h2>
              <p className="mt-1 text-sm text-stone-600">
                Expected source: {item.sourceFilename}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-stone-500">
                Baseline SHA-256: {item.sourceHash}
              </p>
              {item.notes.map((note) => (
                <p key={note} className="mt-2 text-xs text-amber-800">
                  {note}
                </p>
              ))}
              <form
                className="mt-5 flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  form.set('action', 'upload');
                  form.set('slug', slug);
                  void submit(form);
                }}
              >
                <label className="text-sm">
                  DOCX or PDF file
                  <input
                    className="mt-1 block w-full max-w-sm text-sm"
                    type="file"
                    name="file"
                    accept={
                      item.sourceType === 'pdf'
                        ? '.pdf,application/pdf'
                        : '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                    }
                    required
                  />
                </label>
                <label className="text-sm">
                  Import type
                  <select
                    name="kind"
                    className="mt-1 block rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="baseline">Exact baseline</option>
                    <option value="revision">New revision</option>
                  </select>
                </label>
                <button
                  disabled={busy}
                  className="rounded-lg bg-[#ed6435] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Upload and verify
                </button>
              </form>
            </section>
            {selected && (
              <section className="rounded-xl border bg-white p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <label
                      htmlFor="template-version"
                      className="text-xs text-stone-500"
                    >
                      Version
                    </label>
                    <select
                      id="template-version"
                      value={selected.id}
                      onChange={(event) => selectVersion(event.target.value)}
                      className="mt-1 block rounded-lg border px-3 py-2 text-sm"
                    >
                      {available.map((version) => (
                        <option key={version.id} value={version.id}>
                          v{version.versionNumber} · {version.lifecycle}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      View source
                    </a>
                    {item.sourceType === 'docx' && (
                      <a
                        href={`${fileUrl}?render=pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        Preview PDF
                      </a>
                    )}
                  </div>
                </div>
                <p className="mt-3 break-all font-mono text-xs text-stone-500">
                  Stored SHA-256: {selected.sourceHash}
                </p>
                <p className="mt-1 text-xs text-stone-600">
                  {selected.sourceHash === item.sourceHash
                    ? 'Matches the original baseline.'
                    : 'Revision differs from the baseline.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selected.lifecycle === 'draft' && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const form = new FormData();
                        form.set('action', 'activate');
                        form.set('versionId', selected.id);
                        void submit(form);
                      }}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white"
                    >
                      Activate version
                    </button>
                  )}
                  {selected.lifecycle === 'active' && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const form = new FormData();
                        form.set('action', 'retire');
                        form.set('versionId', selected.id);
                        void submit(form);
                      }}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      Retire version
                    </button>
                  )}
                  {selected.lifecycle === 'retired' && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const form = new FormData();
                        form.set('action', 'rollback');
                        form.set('versionId', selected.id);
                        void submit(form);
                      }}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      Roll back to this version
                    </button>
                  )}
                </div>
              </section>
            )}
            {selected && (
              <section className="rounded-xl border bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Field map</h2>
                    <p className="text-xs text-stone-600">
                      All fields need an owner and signer role. PDF coordinates
                      use a 0–1000 page grid.
                    </p>
                  </div>
                  {selected.lifecycle === 'draft' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="rounded-lg border px-3 py-2 text-sm">
                        Import field map JSON
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="sr-only"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            try {
                              const parsed: unknown = JSON.parse(
                                await file.text(),
                              );
                              if (!Array.isArray(parsed))
                                throw new Error(
                                  'Field map must be a JSON array.',
                                );
                              setFields(parsed as TemplateField[]);
                              setSelectedField(0);
                              setMessage(
                                `Loaded ${parsed.length} fields. Review and save the map.`,
                              );
                            } catch (error) {
                              setMessage(
                                error instanceof Error
                                  ? error.message
                                  : 'Invalid JSON map.',
                              );
                            }
                          }}
                        />
                      </label>
                      <button
                        onClick={addField}
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        Add field
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div
                        key={index}
                        className={`rounded-lg border p-3 ${selectedField === index ? 'border-orange-500' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedField(index)}
                          className="mb-2 text-xs font-semibold text-orange-700"
                        >
                          {selectedField === index
                            ? 'Selected for mapping'
                            : 'Select for mapping'}
                        </button>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-xs">
                            Field name
                            <input
                              disabled={selected.lifecycle !== 'draft'}
                              value={field.fieldName}
                              onChange={(event) =>
                                update(index, { fieldName: event.target.value })
                              }
                              className="mt-1 w-full rounded border px-2 py-1 text-sm"
                              placeholder="employee_signature"
                            />
                          </label>
                          <label className="text-xs">
                            Label
                            <input
                              disabled={selected.lifecycle !== 'draft'}
                              value={field.label}
                              onChange={(event) =>
                                update(index, { label: event.target.value })
                              }
                              className="mt-1 w-full rounded border px-2 py-1 text-sm"
                              placeholder="Employee signature"
                            />
                          </label>
                          <label className="text-xs">
                            Type
                            <select
                              disabled={selected.lifecycle !== 'draft'}
                              value={field.fieldType}
                              onChange={(event) =>
                                update(index, {
                                  fieldType: event.target
                                    .value as TemplateField['fieldType'],
                                })
                              }
                              className="mt-1 w-full rounded border px-2 py-1 text-sm"
                            >
                              {[
                                'text',
                                'date',
                                'checkbox',
                                'radio',
                                'initials',
                                'signature',
                              ].map((type) => (
                                <option key={type}>{type}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs">
                            Filled by
                            <select
                              disabled={selected.lifecycle !== 'draft'}
                              value={field.populatedBy}
                              onChange={(event) =>
                                update(index, {
                                  populatedBy: event.target
                                    .value as TemplateField['populatedBy'],
                                })
                              }
                              className="mt-1 w-full rounded border px-2 py-1 text-sm"
                            >
                              {[
                                'admin-fill',
                                'participant-fill',
                                'signer',
                                'system',
                              ].map((owner) => (
                                <option key={owner}>{owner}</option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs">
                            Signer role
                            <select
                              disabled={selected.lifecycle !== 'draft'}
                              value={field.signerRole}
                              onChange={(event) =>
                                update(index, {
                                  signerRole: event.target.value,
                                })
                              }
                              className="mt-1 w-full rounded border px-2 py-1 text-sm"
                            >
                              {item.signers.map((signer) => (
                                <option key={signer.role}>{signer.role}</option>
                              ))}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              disabled={selected.lifecycle !== 'draft'}
                              type="checkbox"
                              checked={field.required}
                              onChange={(event) =>
                                update(index, {
                                  required: event.target.checked,
                                })
                              }
                            />
                            Required
                          </label>
                        </div>
                        {item.sourceType === 'pdf' && (
                          <div className="mt-3 grid grid-cols-5 gap-2">
                            {(
                              [
                                'pageNumber',
                                'x',
                                'y',
                                'width',
                                'height',
                              ] as const
                            ).map((key) => (
                              <label className="text-xs" key={key}>
                                {key}
                                <input
                                  disabled={selected.lifecycle !== 'draft'}
                                  type="number"
                                  min={key === 'pageNumber' ? 1 : 0}
                                  max={
                                    key === 'pageNumber'
                                      ? selected.pageCount
                                      : 1000
                                  }
                                  value={field[key] ?? ''}
                                  onChange={(event) =>
                                    update(index, {
                                      [key]:
                                        event.target.value === ''
                                          ? null
                                          : Number(event.target.value),
                                    })
                                  }
                                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                                />
                              </label>
                            ))}
                          </div>
                        )}
                        {selected.lifecycle === 'draft' && (
                          <button
                            onClick={() =>
                              setFields((current) =>
                                current.filter(
                                  (_, position) => position !== index,
                                ),
                              )
                            }
                            className="mt-2 text-xs text-red-700"
                          >
                            Remove field
                          </button>
                        )}
                      </div>
                    ))}
                    {selected.lifecycle === 'draft' && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          const form = new FormData();
                          form.set('action', 'map');
                          form.set('versionId', selected.id);
                          form.set('fields', JSON.stringify(fields));
                          void submit(form);
                        }}
                        className="rounded-lg bg-[#2c2028] px-4 py-2 text-sm text-white"
                      >
                        Save field map
                      </button>
                    )}
                  </div>
                  <div>
                    {item.sourceType === 'pdf' ? (
                      <>
                        <div className="mb-2 flex items-center gap-2 text-sm">
                          <button
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                            className="rounded border px-2 py-1 disabled:opacity-30"
                          >
                            ←
                          </button>
                          Page {page} of {selected.pageCount}
                          <button
                            disabled={page >= selected.pageCount}
                            onClick={() => setPage(page + 1)}
                            className="rounded border px-2 py-1 disabled:opacity-30"
                          >
                            →
                          </button>
                        </div>
                        <div
                          className="relative overflow-hidden border bg-stone-100"
                          style={{ maxWidth: '100%' }}
                        >
                          <canvas
                            ref={canvas}
                            className="block h-auto w-full"
                            onClick={(event) => {
                              if (
                                selected.lifecycle !== 'draft' ||
                                !fields[selectedField]
                              )
                                return;
                              const box =
                                event.currentTarget.getBoundingClientRect();
                              update(selectedField, {
                                pageNumber: page,
                                x: Math.max(
                                  0,
                                  Math.min(
                                    999,
                                    Math.round(
                                      ((event.clientX - box.left) / box.width) *
                                        1000,
                                    ),
                                  ),
                                ),
                                y: Math.max(
                                  0,
                                  Math.min(
                                    999,
                                    Math.round(
                                      ((event.clientY - box.top) / box.height) *
                                        1000,
                                    ),
                                  ),
                                ),
                              });
                            }}
                          />
                          {fields.map(
                            (field, index) =>
                              field.pageNumber === page &&
                              field.x !== null &&
                              field.y !== null &&
                              field.width !== null &&
                              field.height !== null && (
                                <div
                                  key={index}
                                  className={`pointer-events-none absolute border-2 ${index === selectedField ? 'border-orange-600 bg-orange-200/30' : 'border-sky-700 bg-sky-200/20'}`}
                                  style={{
                                    left: `${field.x / 10}%`,
                                    top: `${field.y / 10}%`,
                                    width: `${field.width / 10}%`,
                                    height: `${field.height / 10}%`,
                                  }}
                                >
                                  <span className="bg-white/90 px-1 text-[10px]">
                                    {field.fieldName}
                                  </span>
                                </div>
                              ),
                          )}
                        </div>
                        <p className="mt-2 text-xs text-stone-600">
                          Select a field, then click its top-left corner on the
                          page. Set width and height in the field card.
                        </p>
                      </>
                    ) : (
                      <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
                        Use literal <code>{'{{field_name}}'}</code> placeholders
                        in the DOCX for each mapped field. Activation verifies
                        every placeholder.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}
            {selected && (
              <section className="rounded-xl border bg-white p-5">
                <h2 className="text-lg font-semibold">Test fill</h2>
                <p className="mt-1 text-xs text-stone-600">
                  Test values are rendered in memory and never saved as signer
                  data.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {selected.fields.map((field) => (
                    <label key={field.fieldName} className="text-xs">
                      {field.label} ({field.signerRole})
                      <input
                        className="mt-1 w-full rounded border px-2 py-2 text-sm"
                        value={values[field.fieldName] ?? ''}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.fieldName]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  disabled={busy}
                  onClick={() => void testFill()}
                  className="mt-4 rounded-lg border px-4 py-2 text-sm"
                >
                  Generate test PDF
                </button>
                {testUrl && (
                  <a
                    className="ml-3 text-sm text-orange-700 underline"
                    href={testUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open test PDF
                  </a>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
