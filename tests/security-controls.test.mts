import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import {
  canonicalAuditPayload,
  hashAuditPayload,
  verifyAuditChain,
} from '../lib/audit-chain.ts';
import { buildFinalArchive } from '../lib/final-archive.ts';
import {
  decryptFileIfNeeded,
  encryptFile,
  isEncryptedFile,
} from '../lib/file-encryption.ts';
import { sanitizeTemplatePdf } from '../lib/pdf-sanitize.ts';
import { CONTENT_SECURITY_POLICY } from '../lib/security-headers.ts';
import { sessionIdleExpired } from '../lib/session-policy.ts';
import { sha256 } from '../lib/template-files.ts';

void test('new audit events use HMAC and a broken link is detected', () => {
  const key = 'test-audit-key-with-enough-length';
  const firstPayload = canonicalAuditPayload({
    id: '1',
    envelopeId: null,
    actorType: 'system',
    actorId: null,
    eventType: 'START',
    detailsJson: '{}',
    userAgent: null,
    occurredAt: '2026-11-17T00:00:00.000Z',
    previousHash: null,
  });
  const firstHash = hashAuditPayload(firstPayload, 'hmac-sha256', key);
  const secondPayload = canonicalAuditPayload({
    id: '2',
    envelopeId: null,
    actorType: 'user',
    actorId: 'user',
    eventType: 'NEXT',
    detailsJson: '{}',
    userAgent: null,
    occurredAt: '2026-11-17T00:01:00.000Z',
    previousHash: firstHash,
  });
  const rows = [
    {
      id: '1',
      eventHash: firstHash,
      previousHash: null,
      hashAlg: 'hmac-sha256' as const,
      canonicalPayload: firstPayload,
    },
    {
      id: '2',
      eventHash: hashAuditPayload(secondPayload, 'hmac-sha256', key),
      previousHash: firstHash,
      hashAlg: 'hmac-sha256' as const,
      canonicalPayload: secondPayload,
    },
  ];
  assert.equal(verifyAuditChain(rows, key).ok, true);
  rows[1].previousHash = '0'.repeat(64);
  const broken = verifyAuditChain(rows, key);
  assert.equal(broken.ok, false);
  assert.equal(broken.reason, 'chain');
  assert.equal(verifyAuditChain(rows, null).reason, 'missing-key');
});

void test('file encryption round-trips and leaves older plaintext readable', () => {
  const previous = process.env.FILE_ENCRYPTION_KEY_V1;
  process.env.FILE_ENCRYPTION_KEY_V1 = Buffer.alloc(32, 7).toString('base64');
  const plain = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]);
  const encrypted = encryptFile(plain, 'documents/example/file.pdf');
  assert.equal(isEncryptedFile(encrypted), true);
  assert.deepEqual(
    decryptFileIfNeeded(encrypted, 'documents/example/file.pdf'),
    plain,
  );
  assert.deepEqual(
    decryptFileIfNeeded(plain, 'documents/example/file.pdf'),
    plain,
  );
  delete process.env.FILE_ENCRYPTION_KEY_V1;
  assert.deepEqual(encryptFile(plain, 'documents/example/file.pdf'), plain);
  if (previous === undefined) delete process.env.FILE_ENCRYPTION_KEY_V1;
  else process.env.FILE_ENCRYPTION_KEY_V1 = previous;
});

void test('idle timeout is 30 minutes by default and the absolute life stays separate', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  assert.equal(
    sessionIdleExpired({
      lastSeenAt: new Date('2026-11-17T11:29:00Z'),
      now,
      idleMinutes: 30,
    }),
    true,
  );
  assert.equal(
    sessionIdleExpired({
      lastSeenAt: new Date('2026-11-17T11:40:00Z'),
      now,
      idleMinutes: 30,
    }),
    false,
  );
});

void test('sanitized PDFs do not keep a JavaScript marker', async () => {
  const document = await PDFDocument.create();
  document.addPage([200, 200]);
  const saved = Buffer.concat([
    Buffer.from(await document.save()),
    Buffer.from('\n% /JavaScript (app.alert(1))\n'),
  ]);
  const clean = await sanitizeTemplatePdf(saved);
  assert.equal(Buffer.from(clean.bytes).includes('/JavaScript'), false);
});

void test('the audit certificate lists the signer, template, and final hash', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  const archive = await buildFinalArchive({
    envelopeId: '33333333-3333-4333-8333-333333333333',
    completedAt: '2026-11-17T15:00:00.000Z',
    templateVersionId: '44444444-4444-4444-8444-444444444444',
    templateSourceHash: 'ab'.repeat(32),
    versions: [{ id: 'final-sec', kind: 'final', hash: sha256(bytes), bytes }],
    events: [
      {
        signerId: '55555555-5555-4555-8555-555555555555',
        name: 'Test Patient Alpha',
        role: 'patient',
        signedAt: '2026-11-17T15:00:00.000Z',
        method: 'typed',
        verificationMethod: 'email_link',
        ipAddress: '203.0.113.5',
        userAgent: 'ExampleBrowser',
        consentVersion: '2026-09-30-1',
        presentedHash: sha256(bytes),
      },
    ],
  });
  const text = await pdfText(archive.certificate);
  assert.match(text, /Test Patient Alpha/);
  assert.match(text, /email_link/);
  assert.match(text, /203\.0\.113\.5/);
  assert.match(text, /ExampleBrowser/);
  assert.match(text, /44444444-4444-4444-8444-444444444444/);
  assert.match(text, new RegExp(sha256(bytes)));
  assert.match(CONTENT_SECURITY_POLICY, /worker-src 'self' blob:/);
  assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /wasm-unsafe-eval/);
});

async function pdfText(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const task = getDocument({
    data: copy,
    disableWorker: true,
    isEvalSupported: false,
  } as never) as {
    promise: Promise<{
      getPage: (page: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
      }>;
    }>;
  };
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item) => item.str ?? '').join('\n');
}
