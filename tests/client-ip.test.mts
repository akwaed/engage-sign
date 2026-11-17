import assert from 'node:assert/strict';
import test from 'node:test';

import { selectClientIp } from '../lib/client-ip.ts';

void test('spoofed forwarded-for does not override the socket or real IP', () => {
  assert.equal(
    selectClientIp({
      forwardedFor: '1.2.3.4',
      realIp: '203.0.113.5',
      socketAddress: '127.0.0.1',
      trustedHops: 0,
    }),
    '203.0.113.5',
  );
  assert.equal(
    selectClientIp({
      forwardedFor: '1.2.3.4',
      socketAddress: '198.51.100.9',
      trustedHops: 0,
    }),
    '198.51.100.9',
  );
});

void test('a trusted proxy uses the rightmost untrusted forwarded hop', () => {
  assert.equal(
    selectClientIp({
      forwardedFor: '1.2.3.4, 203.0.113.5',
      socketAddress: '127.0.0.1',
      trustedHops: 1,
    }),
    '203.0.113.5',
  );
  assert.equal(
    selectClientIp({
      forwardedFor: '203.0.113.5',
      socketAddress: '127.0.0.1',
      trustedHops: 1,
    }),
    '203.0.113.5',
  );
});
