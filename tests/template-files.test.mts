import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';

import {
  fillPdf,
  inspectTemplate,
  mergeDocx,
  sha256,
} from '../lib/template-files.ts';

void test('SHA-256 records the exact uploaded bytes', () => {
  assert.equal(
    sha256(strToU8('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

void test('DOCX inspection and merge preserve XML escaping', async () => {
  const source = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      '<w:document><w:t>{{employee_name}}</w:t></w:document>',
    ),
  });
  const inspection = await inspectTemplate(source, 'docx');
  assert.deepEqual(inspection.placeholders, ['employee_name']);
  const result = mergeDocx(source, { employee_name: 'A & B <C>' });
  assert.match(
    strFromU8(unzipSync(result)['word/document.xml']),
    /A &amp; B &lt;C&gt;/,
  );
  assert.throws(() => mergeDocx(source, { missing: 'value' }), /missing/);
});

void test('PDF inspection checks the signature and test fill produces a valid PDF', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const source = await pdf.save();
  assert.equal((await inspectTemplate(source, 'pdf')).pageCount, 1);
  await assert.rejects(
    inspectTemplate(strToU8('not a PDF'.padEnd(40)), 'pdf'),
    /not a PDF/,
  );
  const result = await fillPdf(
    source,
    [
      {
        fieldName: 'name',
        label: 'Name',
        fieldType: 'text',
        populatedBy: 'signer',
        signerRole: 'participant',
        pageNumber: 1,
        x: 100,
        y: 200,
        width: 500,
        height: 50,
        required: true,
      },
    ],
    { name: 'Test signer' },
  );
  assert.notEqual(sha256(result), sha256(source));
  assert.equal((await PDFDocument.load(result)).getPageCount(), 1);
});
