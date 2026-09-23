import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';

import { buildFinalArchive, verifyFinalArchive } from '../lib/final-archive.ts';
import { appendSignatureEvidence, fillPdf, sha256 } from '../lib/template-files.ts';

void test('prepared, presented, intermediate and final PDFs keep independent hashes', async () => {
  const source = await PDFDocument.create();
  source.addPage([612, 792]);
  const prepared = await fillPdf(await source.save(), [{
    fieldName: 'admin_name', label: 'Admin name', fieldType: 'text',
    populatedBy: 'admin-fill', signerRole: 'signer', pageNumber: 1,
    x: 100, y: 100, width: 300, height: 30, required: true,
  }], { admin_name: 'Test administrator' });
  const presented = Uint8Array.from(prepared);
  const intermediate = await appendSignatureEvidence(prepared, {
    name: 'First Signer', role: 'first', signedAt: '2026-09-23T12:00:00.000Z',
    presentedHash: sha256(presented), method: 'typed',
  });
  const final = await appendSignatureEvidence(intermediate, {
    name: 'Second Signer', role: 'second', signedAt: '2026-09-23T12:05:00.000Z',
    presentedHash: sha256(intermediate), method: 'typed',
  });
  const result = await buildFinalArchive({
    envelopeId: '00000000-0000-0000-0000-000000000001',
    completedAt: '2026-09-23T12:05:00.000Z',
    versions: [
      { id: 'prepared', kind: 'prepared', hash: sha256(prepared), bytes: prepared },
      { id: 'presented', kind: 'presented', hash: sha256(presented), bytes: presented },
      { id: 'intermediate', kind: 'intermediate', hash: sha256(intermediate), bytes: intermediate },
      { id: 'final', kind: 'final', hash: sha256(final), bytes: final },
    ],
    events: [
      { signerId: 'first', name: 'First Signer', role: 'first',
        signedAt: '2026-09-23T12:00:00.000Z', method: 'typed',
        consentVersion: 'test', presentedHash: sha256(presented) },
      { signerId: 'second', name: 'Second Signer', role: 'second',
        signedAt: '2026-09-23T12:05:00.000Z', method: 'typed',
        consentVersion: 'test', presentedHash: sha256(intermediate) },
    ],
  });
  const files = unzipSync(result.archive);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  assert.equal(result.finalHash, sha256(final));
  assert.equal(result.certificateHash, sha256(files['audit-certificate.pdf']));
  assert.equal(result.archiveHash, sha256(result.archive));
  assert.equal(manifest.documentVersions.length, 4);
  assert.equal(manifest.signerEvents.length, 2);
  assert.equal((await PDFDocument.load(files['audit-certificate.pdf'])).getPageCount(), 1);
  assert.equal((await PDFDocument.load(files['final.pdf'])).getPageCount(), 3);
  verifyFinalArchive(result.archive, result.finalHash, result.certificateHash);

  files['final.pdf'] = new Uint8Array(prepared);
  assert.throws(
    () => verifyFinalArchive(zipSync(files), result.finalHash, result.certificateHash),
    /checksum/,
  );
  await assert.rejects(
    buildFinalArchive({
      envelopeId: 'test', completedAt: '2026-09-23T12:05:00.000Z',
      versions: [{ id: 'bad', kind: 'final', hash: sha256(prepared), bytes: final }],
      events: [{ signerId: 'first', name: 'First Signer', role: 'first',
        signedAt: '2026-09-23T12:00:00.000Z', method: 'typed',
        consentVersion: 'test', presentedHash: sha256(presented) }],
    }),
    /SHA-256/,
  );
});
