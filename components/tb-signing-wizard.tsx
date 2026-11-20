'use client';

import { useEffect, useRef, useState } from 'react';

import {
  TB_CONSENT_BULLETS,
  TB_STEPS,
  validateTbStep,
  type TbStep,
} from '@/lib/tb-form';

type Field = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  group: string;
};

export function TbSigningWizard({
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
  const [step, setStep] = useState<TbStep | 'done'>('info');
  const [values, setValues] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<'typed' | 'drawn'>('typed');
  const [typedName, setTypedName] = useState(signerName);
  const [legalConsent, setLegalConsent] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [drawnPng, setDrawnPng] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const stepIndex = step === 'done' ? TB_STEPS.length : TB_STEPS.indexOf(step);

  useEffect(() => {
    void fetch('/api/signing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'view' }),
    });
  }, []);

  function fieldsIn(group: string) {
    return fields.filter(
      (field) => field.group === group && field.type !== 'signature',
    );
  }

  function setValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function advance(next: TbStep | 'done') {
    if (step === 'done') return;
    const issue = validateTbStep(step, values, {
      method,
      typedName,
      drawn,
      legalConsent,
    });
    if (issue.length) {
      setErrors(issue);
      return;
    }
    setErrors([]);
    setStep(next);
  }

  async function submit() {
    const issue = validateTbStep('consent', values, {
      method,
      typedName,
      drawn,
      legalConsent,
    });
    if (issue.length) {
      setErrors(issue);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/signing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          submission: {
            presentedHash,
            consent: true,
            consentVersion,
            method,
            typedName,
            drawnPng: method === 'drawn' ? drawnPng : undefined,
            values: {
              ...values,
              ...(method === 'typed' ? { signature: typedName } : {}),
            },
          },
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Signing failed.');
      setStep('done');
    } catch (caught) {
      setErrors([caught instanceof Error ? caught.message : 'Signing failed.']);
    } finally {
      setBusy(false);
    }
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * event.currentTarget.width) / rect.width,
      y:
        ((event.clientY - rect.top) * event.currentTarget.height) / rect.height,
    };
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-6 text-[#2c2028]">
      <p className="text-sm text-stone-600">Engage Sign · private invitation</p>
      <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm">Signing as {signerName}</p>
      {step !== 'done' && (
        <p className="mt-4 text-sm font-medium">
          Step {stepIndex + 1} of {TB_STEPS.length}: {stepTitle(step)}
        </p>
      )}
      {step === 'done' ? (
        <section className="mt-6 rounded-xl border bg-green-50 p-6">
          <h2 className="text-xl font-semibold">Your response was recorded</h2>
          <p className="mt-3">
            You may close this page. The sender receives the status. This form
            does not produce a diagnosis.
          </p>
        </section>
      ) : (
        <section className="mt-4 rounded-xl border bg-white p-4">
          {step === 'info' && (
            <div className="space-y-4">
              <p className="text-sm">
                Enter the contact details at the top of the form. Social
                Security number is not collected.
              </p>
              {fieldsIn('demographics').map((item) => (
                <FieldControl
                  key={item.name}
                  field={item}
                  value={values[item.name] ?? ''}
                  onChange={setValue}
                />
              ))}
            </div>
          )}
          {step === 'section2' && (
            <div className="space-y-4">
              <p className="text-sm">
                Section II. Check every statement that applies. Leave the rest
                blank. Nothing here is scored or diagnosed.
              </p>
              <h2 className="font-semibold">
                A. Assess Risk for Acquiring LTBI. The patient:
              </h2>
              {fieldsIn('section_2a').map((item) => (
                <FieldControl
                  key={item.name}
                  field={item}
                  value={values[item.name] ?? ''}
                  onChange={setValue}
                />
              ))}
              <h2 className="font-semibold">
                B. Assess Risk for Developing TB Disease if Infected. The
                patient:
              </h2>
              {fieldsIn('section_2b').map((item) => (
                <FieldControl
                  key={item.name}
                  field={item}
                  value={values[item.name] ?? ''}
                  onChange={setValue}
                />
              ))}
            </div>
          )}
          {step === 'review' && (
            <div className="space-y-3 text-sm">
              <p>
                Review the form and your answers. You can go back to change
                them.
              </p>
              <iframe
                title="Form presented for signing"
                src="/api/signing/document"
                className="h-80 w-full rounded border"
              />
              <dl className="space-y-2">
                {fields
                  .filter((item) => item.type !== 'signature')
                  .map((item) => (
                    <div key={item.name} className="border-b pb-2">
                      <dt className="font-medium">{item.label}</dt>
                      <dd>{displayValue(item, values[item.name])}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
          {step === 'consent' && (
            <div className="space-y-4 text-sm">
              <h2 className="text-base font-semibold">Testing authorization</h2>
              <ul className="list-disc space-y-2 pl-5">
                {TB_CONSENT_BULLETS.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={values.consent_ack === 'yes'}
                  onChange={(event) =>
                    setValue('consent_ack', event.target.checked ? 'yes' : '')
                  }
                />
                <span>I have read this authorization and I agree to it.</span>
              </label>
              <label className="block">
                Signature date
                <input
                  type="date"
                  className="mt-1 block w-full rounded border px-3 py-3"
                  value={values.signature_date ?? ''}
                  onChange={(event) =>
                    setValue('signature_date', event.target.value)
                  }
                />
              </label>
              <fieldset>
                <legend className="font-medium">Signature</legend>
                <div className="mt-2 flex gap-4">
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
                  <input
                    aria-label="Typed signature"
                    className="mt-3 block w-full rounded border px-3 py-3"
                    value={typedName}
                    onChange={(event) => setTypedName(event.target.value)}
                  />
                ) : (
                  <div className="mt-3">
                    <canvas
                      ref={canvas}
                      width={340}
                      height={130}
                      aria-label="Draw your signature"
                      className="w-full touch-none rounded border"
                      onPointerDown={(event) => {
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
                      }}
                      onPointerMove={(event) => {
                        if (!drawing.current) return;
                        const position = point(event);
                        const context = event.currentTarget.getContext('2d');
                        context?.lineTo(position.x, position.y);
                        context?.stroke();
                        setDrawn(true);
                      }}
                      onPointerUp={() => {
                        drawing.current = false;
                        setDrawnPng(
                          canvas.current?.toDataURL('image/png') ?? '',
                        );
                      }}
                    />
                  </div>
                )}
              </fieldset>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={legalConsent}
                  onChange={(event) => setLegalConsent(event.target.checked)}
                />
                <span>
                  {consentText}
                  <small className="mt-1 block text-stone-500">
                    Consent version {consentVersion}
                  </small>
                </span>
              </label>
            </div>
          )}
          {errors.length > 0 && (
            <ul
              role="alert"
              className="mt-4 list-disc space-y-1 pl-5 text-sm text-red-700"
            >
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <div className="mt-6 flex gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                className="rounded border px-4 py-3"
                onClick={() => {
                  setErrors([]);
                  setStep(TB_STEPS[stepIndex - 1]);
                }}
              >
                Back
              </button>
            )}
            {step !== 'consent' ? (
              <button
                type="button"
                className="flex-1 rounded bg-[#ed6435] px-4 py-3 font-medium text-white"
                onClick={() => advance(TB_STEPS[stepIndex + 1])}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="flex-1 rounded bg-[#ed6435] px-4 py-3 font-medium text-white disabled:opacity-50"
                onClick={() => void submit()}
              >
                Sign and submit
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={value === 'yes'}
          onChange={(event) =>
            onChange(field.name, event.target.checked ? 'yes' : '')
          }
        />
        <span>
          {field.label}
          {field.required ? ' *' : ''}
        </span>
      </label>
    );
  }
  const inputType =
    field.type === 'date' ? 'date' : field.type === 'phone' ? 'tel' : 'text';
  return (
    <label className="block text-sm">
      <span>
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      <input
        type={inputType}
        className="mt-1 block w-full rounded border px-3 py-3"
        value={value}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    </label>
  );
}

function displayValue(field: Field, value: string | undefined) {
  if (!value) return 'Blank';
  if (field.type === 'checkbox') return value === 'yes' ? 'Checked' : 'Blank';
  return value;
}

function stepTitle(step: TbStep) {
  if (step === 'info') return 'Your information';
  if (step === 'section2') return 'Section II';
  if (step === 'review') return 'Review';
  return 'Consent and signature';
}
