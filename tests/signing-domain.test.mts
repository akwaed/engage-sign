import assert from 'node:assert/strict';
import test from 'node:test';

import { decryptValue, encryptValue } from '../lib/encryption.ts';
import {
  createSigningToken,
  envelopeStatus,
  hashSigningToken,
  nextEligibleSigners,
  validateReminderDays,
  type SignerState,
} from '../lib/signing-domain.ts';

void test('each signing token is random and only its hash is retained', () => {
  const first = createSigningToken();
  const second = createSigningToken();
  assert.notEqual(first, second);
  assert.equal(first.length, 43);
  assert.equal(hashSigningToken(first).length, 64);
  assert.notEqual(hashSigningToken(first), first);
});

void test('ordered routing waits for required prior signers and supports optional roles', () => {
  const states: SignerState[] = [
    { id: 'first', routingOrder: 1, required: true, status: 'pending' },
    { id: 'optional', routingOrder: 1, required: false, status: 'pending' },
    { id: 'second', routingOrder: 2, required: true, status: 'pending' },
  ];
  assert.deepEqual(
    nextEligibleSigners(states).map((item) => item.id),
    ['first', 'optional'],
  );
  states[0].status = 'signed';
  states[1].status = 'viewed';
  assert.deepEqual(
    nextEligibleSigners(states).map((item) => item.id),
    ['second'],
  );
  assert.equal(envelopeStatus(states, 'sent'), 'partially_signed');
  states[2].status = 'signed';
  assert.equal(envelopeStatus(states, 'partially_signed'), 'completed');
});

void test('parallel routing releases all signers and required decline closes the envelope', () => {
  const states: SignerState[] = [
    { id: 'a', routingOrder: 1, required: true, status: 'pending' },
    { id: 'b', routingOrder: 1, required: true, status: 'pending' },
  ];
  assert.deepEqual(
    nextEligibleSigners(states).map((item) => item.id),
    ['a', 'b'],
  );
  states[1].status = 'declined';
  assert.equal(envelopeStatus(states, 'sent'), 'declined');
});

void test('reminder overrides validate and de-duplicate days', () => {
  assert.deepEqual(validateReminderDays([1, 7, 3, 7]), [7, 3, 1]);
  assert.throws(() => validateReminderDays([0]));
});

void test('sensitive values use authenticated encryption with context binding', () => {
  process.env.ENCRYPTION_KEY_V1 = Buffer.alloc(32, 7).toString('base64');
  const ciphertext = encryptValue('Sensitive example', 'field:one');
  assert.ok(!ciphertext.includes('Sensitive example'));
  assert.equal(decryptValue(ciphertext, 'field:one'), 'Sensitive example');
  assert.throws(() => decryptValue(ciphertext, 'field:two'));
  delete process.env.ENCRYPTION_KEY_V1;
});
