import assert from 'node:assert/strict';
import test from 'node:test';

import { renderMail, notificationKind } from '../lib/mail-templates.ts';
import { safeErrorCode, sanitizeProviderResponse } from '../lib/mail-security.ts';

void test('all mail types render branded text and escaped HTML', () => {
  for (const kind of [
    'invite', 'next_signer', 'reminder', 'completion', 'expiration', 'decline', 'void',
  ] as const) {
    const result = renderMail({
      kind, name: '<Test Recipient>', title: 'Agreement & <terms>',
      expiresAt: new Date('2026-10-01T12:00:00Z'),
      signingUrl: kind === 'invite' || kind === 'next_signer'
        ? 'https://sign.example.test/s/private-token' : undefined,
    });
    assert.match(result.html, /ENGAGE SIGN/);
    assert.match(result.html, /&lt;Test Recipient&gt;/);
    assert.doesNotMatch(result.html, /Agreement & <terms>/);
    assert.match(result.text, /Agreement & <terms>/);
    assert.equal(result.text.includes('/s/private-token'),
      kind === 'invite' || kind === 'next_signer');
  }
  assert.equal(notificationKind('reminder_7'), 'reminder');
  assert.throws(() => notificationKind('unknown'), /Unknown/);
});

void test('delivery records remove URLs and never include raw provider errors', () => {
  const token = 'A'.repeat(43);
  const response = sanitizeProviderResponse(`250 accepted https://site.test/s/${token}`);
  assert.doesNotMatch(response, new RegExp(token));
  assert.doesNotMatch(response, /https:/);
  assert.equal(safeErrorCode({ code: 'EAUTH', message: token }), 'EAUTH');
  assert.equal(safeErrorCode(new Error(token)), 'UNKNOWN');
});
