import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

import {
  denormalizeBox,
  fromPdfLibRect,
  normalizeBox,
  snapBox,
  toPdfLibRect,
} from '../lib/pdf-geometry.ts';
import { assertPdfUpload, sanitizeTemplatePdf } from '../lib/pdf-sanitize.ts';
import {
  assertDraftMutable,
  templateActionAllowed,
} from '../lib/template-permissions.ts';
import { fillPdf } from '../lib/template-files.ts';

const manager = {
  id: 'manager',
  role: 'template_manager' as const,
  canPublish: false,
};
const publisher = { ...manager, canPublish: true };
const standard = {
  id: 'user',
  role: 'standard_user' as const,
  canPublish: false,
};

void test('only draft versions can be edited and publish is a separate grant', () => {
  assert.doesNotThrow(() => assertDraftMutable('draft'));
  assert.throws(() => assertDraftMutable('active'), /immutable/);
  assert.throws(() => assertDraftMutable('retired'), /immutable/);
  assert.equal(templateActionAllowed(manager, 'edit'), true);
  assert.equal(templateActionAllowed(manager, 'publish'), false);
  assert.equal(templateActionAllowed(publisher, 'publish'), true);
  assert.equal(templateActionAllowed(standard, 'edit'), false);
});

void test('PDF points round-trip on a later page', () => {
  const page = { width: 612, height: 792 };
  const box = { page: 2, x: 72, y: 36, width: 180.5, height: 24 };
  const placed = toPdfLibRect(box, page);
  assert.equal(placed.y, 792 - 36 - 24);
  assert.deepEqual(fromPdfLibRect(placed, page, 2), box);
  assert.deepEqual(denormalizeBox(normalizeBox(box, page), page), box);
  const snapped = snapBox(
    { ...box, x: 70 },
    [{ page: 2, x: 72, y: 100, width: 10, height: 10 }],
    page,
  );
  assert.equal(snapped.box.x, 72);
});

void test('upload validation rejects non-PDFs and flattens a multi-page PDF', async () => {
  assert.throws(() => assertPdfUpload(new Uint8Array(64).fill(1)), /not a PDF/);
  const source = await PDFDocument.create();
  source.addPage([612, 792]);
  source.addPage([612, 792]);
  const saved = await source.save();
  const clean = await sanitizeTemplatePdf(saved);
  assert.equal(clean.pageCount, 2);
  assert.equal(clean.bytes[0], 0x25);
  const reloaded = await PDFDocument.load(clean.bytes);
  assert.equal(reloaded.getPageCount(), 2);
  const filled = await fillPdf(
    clean.bytes,
    [
      {
        fieldName: 'note',
        label: 'Note',
        fieldType: 'text',
        populatedBy: 'signer',
        signerRole: 'signer',
        pageNumber: 2,
        x: 72,
        y: 40,
        width: 200,
        height: 20,
        required: false,
      },
    ],
    { note: 'Page two' },
    'pdf_points',
  );
  assert.equal((await PDFDocument.load(filled)).getPageCount(), 2);
});
