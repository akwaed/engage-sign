'use client';

import { useEffect, useRef, useState } from 'react';

type Field = { name: string; label: string; type: string; required: boolean };

export function SigningForm({
  title,
  signerName,
  presentedHash,
  fields,
  consentText,
  consentVersion,
}: {
  title: string;
  signerName: string;
  presentedHash: string;
  fields: Field[];
  consentText: string;
  consentVersion: string;
}) {
  const [step, setStep] = useState<'fill' | 'review' | 'done'>('fill');
  const [values, setValues] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<'typed' | 'drawn'>('typed');
  const [typedName, setTypedName] = useState(signerName);
  const [consent, setConsent] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [drawnPng, setDrawnPng] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    void fetch('/api/signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'view' }),
    });
  }, []);

  useEffect(() => {
    if (step !== 'fill' || method !== 'drawn' || !drawnPng || !canvas.current)
      return;
    const image = new Image();
    image.onload = () =>
      canvas.current?.getContext('2d')?.drawImage(image, 0, 0);
    image.src = drawnPng;
  }, [step, method, drawnPng]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * event.currentTarget.width) / rect.width,
      y:
        ((event.clientY - rect.top) * event.currentTarget.height) / rect.height,
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = point(event);
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    context.strokeStyle = '#1e293b';
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(position.x, position.y);
    drawing.current = true;
  }

  function moveDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const position = point(event);
    const context = event.currentTarget.getContext('2d');
    context?.lineTo(position.x, position.y);
    context?.stroke();
    setDrawn(true);
  }

  function validate() {
    for (const field of fields.filter(
      (item) => item.required && item.type !== 'signature',
    ))
      if (!values[field.name]?.trim()) return `${field.label} is required.`;
    if (method === 'typed' && !typedName.trim())
      return 'Type your full name as your signature.';
    if (method === 'drawn' && !drawn)
      return 'Draw your signature, or choose typed signature.';
    return '';
  }

  async function submit(action: 'submit' | 'decline') {
    setError('');
    setBusy(true);
    try {
      const submission =
        action === 'submit'
          ? {
              presentedHash,
              consent,
              method,
              typedName,
              drawnPng: method === 'drawn' ? drawnPng : undefined,
              values,
            }
          : undefined;
      const response = await fetch('/api/signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, submission }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Signing failed.');
      setStep('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Signing failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 text-[#2c2028]">
      <div className="mb-6">
        <p className="text-sm text-stone-600">
          Engage Sign · secure recipient review
        </p>
        <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm">Signing as {signerName}</p>
      </div>
      {step === 'done' ? (
        <section className="rounded-xl border bg-green-50 p-8">
          <h2 className="text-xl font-semibold">Your response was recorded</h2>
          <p className="mt-3">
            You may close this page. The sender will receive the updated
            document status.
          </p>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section
            aria-label="Document to review"
            className="rounded-xl border bg-white p-3"
          >
            <h2 className="px-2 pb-3 text-lg font-semibold">
              Document shown for your signature
            </h2>
            <iframe
              title="Exact PDF presented for signing"
              src="/api/signing/document"
              className="h-[72vh] min-h-[500px] w-full border"
            />
            <a
              href="/api/signing/document"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block px-2 text-sm text-orange-700 underline"
            >
              Open PDF in a new tab
            </a>
            <p className="px-2 pt-3 text-xs text-stone-600">
              Document SHA-256: {presentedHash}
            </p>
          </section>
          {step === 'fill' ? (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-semibold">Complete your fields</h2>
              <div className="mt-4 space-y-4">
                {fields
                  .filter((field) => field.type !== 'signature')
                  .map((field) => (
                    <label key={field.name} className="block text-sm">
                      <span>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </span>
                      {field.type === 'checkbox' || field.type === 'radio' ? (
                        <select
                          value={values[field.name] ?? ''}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [field.name]: event.target.value,
                            }))
                          }
                          className="mt-1 block w-full rounded border px-3 py-2"
                        >
                          <option value="">Choose</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : (
                        <input
                          type={field.type === 'date' ? 'date' : 'text'}
                          maxLength={field.type === 'initials' ? 8 : 500}
                          value={values[field.name] ?? ''}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [field.name]: event.target.value,
                            }))
                          }
                          className="mt-1 block w-full rounded border px-3 py-2"
                        />
                      )}
                    </label>
                  ))}
              </div>
              <fieldset className="mt-6">
                <legend className="font-medium">Signature method</legend>
                <div className="mt-2 flex gap-5 text-sm">
                  <label>
                    <input
                      type="radio"
                      checked={method === 'typed'}
                      onChange={() => setMethod('typed')}
                    />{' '}
                    Type
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={method === 'drawn'}
                      onChange={() => setMethod('drawn')}
                    />{' '}
                    Draw
                  </label>
                </div>
                {method === 'typed' ? (
                  <label className="mt-3 block text-sm">
                    Type your full name
                    <input
                      value={typedName}
                      onChange={(event) => setTypedName(event.target.value)}
                      className="mt-1 block w-full rounded border px-3 py-2"
                    />
                  </label>
                ) : (
                  <div className="mt-3">
                    <p className="text-sm">
                      Draw with a mouse, touch screen, or pen. Typed signature
                      remains available for keyboard users.
                    </p>
                    <canvas
                      ref={canvas}
                      width={340}
                      height={130}
                      aria-label="Draw your signature"
                      onPointerDown={startDrawing}
                      onPointerMove={moveDrawing}
                      onPointerUp={() => {
                        drawing.current = false;
                        setDrawnPng(
                          canvas.current?.toDataURL('image/png') ?? '',
                        );
                      }}
                      className="mt-2 w-full touch-none rounded border bg-white"
                    />
                    <button
                      type="button"
                      className="mt-2 text-sm underline"
                      onClick={() => {
                        canvas.current
                          ?.getContext('2d')
                          ?.clearRect(0, 0, 340, 130);
                        setDrawn(false);
                        setDrawnPng('');
                      }}
                    >
                      Clear drawing
                    </button>
                  </div>
                )}
              </fieldset>
              {error && (
                <p role="alert" className="mt-4 text-sm text-red-700">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="mt-6 w-full rounded bg-[#ed6435] px-4 py-3 font-medium text-white"
                onClick={() => {
                  const issue = validate();
                  if (issue) setError(issue);
                  else {
                    setError('');
                    setStep('review');
                  }
                }}
              >
                Review before signing
              </button>
            </section>
          ) : (
            <section className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-semibold">Review your response</h2>
              <p className="mt-2 text-sm">
                Review the PDF and your entries before submitting.
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                {fields
                  .filter((field) => field.type !== 'signature')
                  .map((field) => (
                    <div key={field.name} className="border-b pb-2">
                      <dt className="font-medium">{field.label}</dt>
                      <dd>{values[field.name] || 'Blank'}</dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-4 text-sm">
                Signature: {method === 'typed' ? typedName : 'Drawn signature'}
              </p>
              <label className="mt-5 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  {consentText}{' '}
                  <small className="block text-stone-500">
                    Consent version {consentVersion}
                  </small>
                </span>
              </label>
              {error && (
                <p role="alert" className="mt-4 text-sm text-red-700">
                  {error}
                </p>
              )}
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStep('fill')}
                  className="rounded border px-4 py-2"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy || !consent}
                  onClick={() => void submit('submit')}
                  className="flex-1 rounded bg-[#ed6435] px-4 py-2 font-medium text-white disabled:opacity-50"
                >
                  Sign and submit
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit('decline')}
                className="mt-5 text-sm text-red-700 underline"
              >
                Decline to sign
              </button>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
