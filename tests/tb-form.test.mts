import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import test from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { buildFinalArchive } from '../lib/final-archive.ts';
import { sanitizeTemplatePdf } from '../lib/pdf-sanitize.ts';
import {
  appendSignatureEvidence,
  fillPdf,
  sha256,
} from '../lib/template-files.ts';
import {
  TB_FIELDS,
  TB_FICTIONAL_PATIENT,
  TB_FORM_SOURCE,
  tbSeedRefusal,
  validateTbStep,
} from '../lib/tb-form.ts';

const samplePdf = new URL(
  '../docs/samples/ky-tb-4-completed.pdf',
  import.meta.url,
);
const sampleCertificate = new URL(
  '../docs/samples/ky-tb-4-audit-certificate.pdf',
  import.meta.url,
);
const samplePng = new URL(
  '../docs/samples/ky-tb-4-completed-page.png',
  import.meta.url,
);

void test('the TB template records its public source and does not score answers', () => {
  assert.equal(TB_FORM_SOURCE.formNumber, 'TB-4');
  assert.equal(TB_FORM_SOURCE.revision, '3/2014');
  assert.match(TB_FORM_SOURCE.sourceUrl, /^https:\/\/www\.chfs\.ky\.gov\//);
  assert.equal(
    TB_FIELDS.some((field) => /ssn|social/i.test(field.fieldName)),
    false,
  );
  assert.equal(
    TB_FIELDS.filter((field) => field.groupKey === 'section_2a').length,
    10,
  );
  assert.equal(
    TB_FIELDS.filter(
      (field) =>
        field.groupKey === 'section_2b' && field.fieldType === 'checkbox',
    ).length,
    8,
  );
  assert.deepEqual(validateTbStep('section2', {}), []);
  assert.deepEqual(
    validateTbStep(
      'section2',
      Object.fromEntries(TB_FIELDS.map((field) => [field.fieldName, 'yes'])),
    ),
    [],
  );
  assert.match(validateTbStep('info', {})[0], /Patient name/);
  assert.equal(
    tbSeedRefusal({ APP_URL: 'https://sign.engagess.co' }, ['--confirm']),
    'Refusing to seed the TB template when APP_URL is the production site.',
  );
  const blocked = tbSeedRefusal({ APP_URL: 'http://localhost:3001' }, []);
  assert.ok(blocked);
  assert.match(blocked, /--confirm/);
});

void test('a fictional patient completes TB-4 and every answer lands on its blank', async () => {
  const source = new Uint8Array(
    readFileSync(
      new URL('../fixtures/templates/ky-dph-tb-4.pdf', import.meta.url),
    ),
  );
  const clean = await sanitizeTemplatePdf(source);
  const values = { ...TB_FICTIONAL_PATIENT };
  const filled = await fillPdf(clean.bytes, TB_FIELDS, values, 'pdf_points');
  const finalPdf = await appendSignatureEvidence(filled, {
    name: values.patient_name,
    role: 'patient',
    signedAt: '2026-11-17T15:00:00.000Z',
    presentedHash: sha256(clean.bytes),
    method: 'typed',
  });
  const archive = await buildFinalArchive({
    envelopeId: '11111111-1111-4111-8111-111111111111',
    completedAt: '2026-11-17T15:00:00.000Z',
    versions: [
      {
        id: 'presented-tb',
        kind: 'presented',
        hash: sha256(clean.bytes),
        bytes: clean.bytes,
      },
      {
        id: 'final-tb',
        kind: 'final',
        hash: sha256(finalPdf),
        bytes: finalPdf,
      },
    ],
    events: [
      {
        signerId: '22222222-2222-4222-8222-222222222222',
        name: values.patient_name,
        role: 'patient',
        signedAt: '2026-11-17T15:00:00.000Z',
        method: 'typed',
        consentVersion: '2026-09-30-1',
        presentedHash: sha256(clean.bytes),
      },
    ],
  });
  const text = await pageText(finalPdf, 1);
  assert.match(text, /Test Patient Alpha/);
  assert.match(text, /01\/01\/1990/);
  assert.match(text, /100 Example Lane/);
  assert.match(text, /None stated/);
  assert.doesNotMatch(text, /diagnosis|score/i);
  const certificateText = await pageText(archive.certificate, 1);
  assert.match(certificateText, /Test Patient Alpha/);
  assert.match(certificateText, /11111111-1111-4111-8111-111111111111/);
  await assertInk(clean.bytes, finalPdf);
  if (process.env.WRITE_SAMPLES === '1') {
    mkdirSync(new URL('../docs/samples/', import.meta.url), {
      recursive: true,
    });
    writeFileSync(samplePdf, finalPdf);
    writeFileSync(sampleCertificate, archive.certificate);
    writeFileSync(samplePng, await renderPng(finalPdf));
  }
  assert.equal(readFileSync(samplePdf).subarray(0, 5).toString(), '%PDF-');
  assert.equal(
    readFileSync(sampleCertificate).subarray(0, 5).toString(),
    '%PDF-',
  );
  assert.equal(
    readFileSync(samplePng).subarray(0, 4).toString('hex'),
    '89504e47',
  );
});

function ownedPdf(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function openPdf(bytes: Uint8Array) {
  const task = getDocument({
    data: ownedPdf(bytes),
    disableWorker: true,
    isEvalSupported: false,
  } as never) as { promise: Promise<PdfHandle> };
  return task.promise;
}

type PdfHandle = {
  getPage: (pageNumber: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    getViewport: (options: { scale: number }) => {
      width: number;
      height: number;
    };
    render: (options: object) => { promise: Promise<void> };
  }>;
};

async function pageText(bytes: Uint8Array, pageNumber: number) {
  const pdf = await openPdf(bytes);
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ('str' in item ? item.str : ''))
    .join('\n');
}

async function assertInk(blank: Uint8Array, filled: Uint8Array) {
  const before = await renderRaw(blank);
  const after = await renderRaw(filled);
  for (const field of TB_FIELDS) {
    const value =
      TB_FICTIONAL_PATIENT[
        field.fieldName as keyof typeof TB_FICTIONAL_PATIENT
      ];
    const expectsInk =
      field.fieldType === 'checkbox' ? value === 'yes' : Boolean(value);
    const changed = changedPixels(before, after, field);
    if (expectsInk)
      assert.ok(
        changed >= 8,
        `${field.fieldName} did not land in its box (${changed})`,
      );
    else if (field.fieldType === 'checkbox')
      assert.ok(
        changed < 8,
        `${field.fieldName} was marked without an answer (${changed})`,
      );
  }
}

async function renderRaw(bytes: Uint8Array) {
  const pdf = await openPdf(bytes);
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport, canvas } as never)
    .promise;
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function renderPng(bytes: Uint8Array) {
  const pdf = await openPdf(bytes);
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(viewport.width, viewport.height);
  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
    canvas,
  } as never).promise;
  return canvas.toBuffer('image/png');
}

function changedPixels(
  before: { data: Uint8ClampedArray; width: number },
  after: { data: Uint8ClampedArray; width: number },
  field: {
    x: number | null;
    y: number | null;
    width: number | null;
    height: number | null;
  },
) {
  const scale = 2;
  const x0 = Math.max(0, Math.floor((field.x ?? 0) * scale) - 2);
  const y0 = Math.max(0, Math.floor((field.y ?? 0) * scale) - 2);
  const x1 = Math.floor(((field.x ?? 0) + (field.width ?? 0)) * scale) + 2;
  const y1 = Math.floor(((field.y ?? 0) + (field.height ?? 0)) * scale) + 2;
  let changed = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = (y * before.width + x) * 4;
      if (Math.abs(before.data[index] - after.data[index]) > 40) changed++;
    }
  }
  return changed;
}
