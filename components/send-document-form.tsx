'use client';

import { useState } from 'react';
import Link from 'next/link';

export type SendTemplate = {
  id: string;
  name: string;
  versionNumber: number;
  signers: Array<{ role: string; order: number; required: boolean }>;
  adminFields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
  }>;
};

type Draft = {
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
};

export function SendDocumentForm({
  templates,
  defaultExpiration,
  defaultReminderDays,
  initial,
}: {
  templates: SendTemplate[];
  defaultExpiration: number;
  defaultReminderDays: number[];
  initial?: Draft;
}) {
  const [templateId, setTemplateId] = useState(
    initial?.templateVersionId ?? templates[0]?.id ?? '',
  );
  const template = templates.find((item) => item.id === templateId);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [routingMode, setRoutingMode] = useState<'ordered' | 'parallel'>(
    initial?.routingMode ?? 'ordered',
  );
  const [expiration, setExpiration] = useState(
    initial?.expiresInDays ?? defaultExpiration,
  );
  const [reminders, setReminders] = useState(
    (initial?.reminderDays ?? defaultReminderDays).join(', '),
  );
  const [adminValues, setAdminValues] = useState<Record<string, string>>(
    initial?.adminValues ?? {},
  );
  const [recipients, setRecipients] = useState<
    Record<string, { name: string; email: string; included: boolean }>
  >(initial?.recipients ?? {});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [createdId, setCreatedId] = useState(initial?.id ?? '');

  function updateRecipient(
    role: string,
    patch: Partial<{ name: string; email: string; included: boolean }>,
  ) {
    setRecipients((current) => ({
      ...current,
      [role]: {
        name: current[role]?.name ?? '',
        email: current[role]?.email ?? '',
        included: current[role]?.included ?? false,
        ...patch,
      },
    }));
  }

  async function save(sendNow: boolean) {
    if (!template) return;
    setBusy(true);
    setMessage('');
    try {
      const reminderDays = reminders.trim()
        ? reminders.split(',').map((item) => Number(item.trim()))
        : [];
      const input = {
        templateVersionId: template.id,
        title,
        routingMode,
        expiresInDays: expiration,
        reminderDays,
        adminValues,
        recipients: template.signers
          .filter(
            (signer) => signer.required || recipients[signer.role]?.included,
          )
          .map((signer) => ({
            role: signer.role,
            name: recipients[signer.role]?.name ?? '',
            email: recipients[signer.role]?.email ?? '',
          })),
      };
      const response = await fetch(
        initial ? `/api/envelopes/${initial.id}` : '/api/envelopes',
        {
          method: initial ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            initial ? { action: 'update', input } : { input, sendNow },
          ),
        },
      );
      const result = (await response.json()) as {
        id?: string;
        draftId?: string;
        error?: string;
        status?: string;
      };
      if (!response.ok) {
        if (result.draftId) setCreatedId(result.draftId);
        throw new Error(result.error ?? 'Document could not be saved.');
      }
      if (initial && sendNow) {
        const sendResponse = await fetch(`/api/envelopes/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'send' }),
        });
        const sent = (await sendResponse.json()) as { error?: string };
        if (!sendResponse.ok)
          throw new Error(sent.error ?? 'Draft saved but could not be sent.');
      }
      setCreatedId(result.id ?? '');
      setMessage(
        sendNow
          ? 'Document sent. Invitation delivery is tracked on its status page.'
          : 'Draft saved. You can send it from its status page.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Document could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 text-[#2c2028]">
      <Link href="/" className="text-sm underline">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">Send a document</h1>
      <p className="mt-2 text-sm text-stone-600">
        Choose an active template, fill preparer fields, and assign each signer
        role.
      </p>
      {message && (
        <output className="mt-5 block rounded border bg-amber-50 p-3 text-sm">
          {message}
        </output>
      )}
      {createdId && (
        <Link
          href={`/admin/documents/${createdId}`}
          className="mt-3 inline-block text-sm text-orange-700 underline"
        >
          View document status
        </Link>
      )}
      {!templates.length ? (
        <p className="mt-8 rounded border bg-white p-6">
          No template is active yet. Import, review, and activate a template
          before sending.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Document</h2>
            <label className="mt-4 block text-sm">
              Template
              <select
                value={templateId}
                onChange={(event) => {
                  setTemplateId(event.target.value);
                  setAdminValues({});
                  setRecipients({});
                }}
                className="mt-1 block w-full rounded border px-3 py-2"
              >
                {templates.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} · v{item.versionNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block text-sm">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={255}
                className="mt-1 block w-full rounded border px-3 py-2"
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="text-sm">
                Routing
                <select
                  value={routingMode}
                  onChange={(event) =>
                    setRoutingMode(event.target.value as 'ordered' | 'parallel')
                  }
                  className="mt-1 block w-full rounded border px-3 py-2"
                >
                  <option value="ordered">Ordered</option>
                  <option value="parallel">Parallel</option>
                </select>
              </label>
              <label className="text-sm">
                Expires in days
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={expiration}
                  onChange={(event) =>
                    setExpiration(Number(event.target.value))
                  }
                  className="mt-1 block w-full rounded border px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Remind days before expiry
                <input
                  value={reminders}
                  onChange={(event) => setReminders(event.target.value)}
                  placeholder="7, 3, 1"
                  className="mt-1 block w-full rounded border px-3 py-2"
                />
              </label>
            </div>
          </section>
          {template?.adminFields.length ? (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-semibold">Administrator fields</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {template.adminFields.map((field) => (
                  <label key={field.name} className="text-sm">
                    {field.label}
                    {field.required ? ' *' : ''}
                    <input
                      type={field.type === 'date' ? 'date' : 'text'}
                      value={adminValues[field.name] ?? ''}
                      onChange={(event) =>
                        setAdminValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                      className="mt-1 block w-full rounded border px-3 py-2"
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}
          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Recipients</h2>
            <p className="mt-1 text-sm text-stone-600">
              Required roles must be assigned. Optional roles can be omitted.
            </p>
            <div className="mt-4 space-y-5">
              {template?.signers.map((signer) => (
                <fieldset key={signer.role} className="rounded-lg border p-4">
                  <legend className="px-1 font-medium">
                    {signer.role.replaceAll('_', ' ')}{' '}
                    {signer.required ? '(required)' : '(optional)'}
                  </legend>
                  {!signer.required && (
                    <label className="mb-3 flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={recipients[signer.role]?.included ?? false}
                        onChange={(event) =>
                          updateRecipient(signer.role, {
                            included: event.target.checked,
                          })
                        }
                      />{' '}
                      Include this signer
                    </label>
                  )}
                  {(signer.required || recipients[signer.role]?.included) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm">
                        Full name
                        <input
                          value={recipients[signer.role]?.name ?? ''}
                          onChange={(event) =>
                            updateRecipient(signer.role, {
                              name: event.target.value,
                            })
                          }
                          className="mt-1 block w-full rounded border px-3 py-2"
                        />
                      </label>
                      <label className="text-sm">
                        Email
                        <input
                          type="email"
                          value={recipients[signer.role]?.email ?? ''}
                          onChange={(event) =>
                            updateRecipient(signer.role, {
                              email: event.target.value,
                            })
                          }
                          className="mt-1 block w-full rounded border px-3 py-2"
                        />
                      </label>
                    </div>
                  )}
                </fieldset>
              ))}
            </div>
          </section>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy}
              onClick={() => void save(false)}
              className="rounded border px-5 py-3 disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              disabled={busy}
              onClick={() => void save(true)}
              className="rounded bg-[#ed6435] px-5 py-3 font-medium text-white disabled:opacity-50"
            >
              Send invitations
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
