import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canEditTemplates,
  canManageUsers,
  canPublishTemplates,
  canReadAllDocuments,
  canReadEnvelope,
  canSendDocuments,
  type AccessUser,
} from '../lib/auth/rbac.ts';
import { rateAllowed, rateWindowStart } from '../lib/auth/rate-limit-policy.ts';
import {
  FORGOT_MESSAGE,
  createResetToken,
  hashResetToken,
  resetExpiry,
  resetTokenUsable,
} from '../lib/auth/reset-token.ts';
import { setupAllowed } from '../lib/auth/setup-policy.ts';
import { renderAccountMail } from '../lib/mail-templates.ts';

const admin: AccessUser = { id: 'admin', role: 'admin', canPublish: false };
const manager: AccessUser = {
  id: 'manager',
  role: 'template_manager',
  canPublish: false,
};
const publisher: AccessUser = {
  id: 'publisher',
  role: 'template_manager',
  canPublish: true,
};
const standard: AccessUser = {
  id: 'standard',
  role: 'standard_user',
  canPublish: false,
};
const legacyStaff: AccessUser = {
  id: 'staff',
  role: 'staff',
  canPublish: false,
};

void test('roles are enforced for templates, sending, and other users documents', () => {
  assert.equal(canManageUsers(admin), true);
  assert.equal(canManageUsers(publisher), false);
  assert.equal(canEditTemplates(manager), true);
  assert.equal(canEditTemplates(standard), false);
  assert.equal(canPublishTemplates(manager), false);
  assert.equal(canPublishTemplates(publisher), true);
  assert.equal(canPublishTemplates(admin), true);
  assert.equal(canSendDocuments(standard), true);
  assert.equal(canSendDocuments(legacyStaff), true);
  assert.equal(canReadAllDocuments(standard), false);
  assert.equal(canReadEnvelope(standard, 'standard'), true);
  assert.equal(canReadEnvelope(standard, 'someone-else'), false);
  assert.equal(canReadEnvelope(admin, 'someone-else'), true);
  assert.equal(canReadEnvelope(legacyStaff, 'admin'), false);
});

void test('setup stays closed after the first administrator and requires a token', () => {
  assert.equal(
    setupAllowed({
      setupCompleted: true,
      userCount: 0,
      suppliedToken: 'correct-token',
      expectedToken: 'correct-token',
    }),
    'closed',
  );
  assert.equal(
    setupAllowed({
      setupCompleted: false,
      userCount: 2,
      suppliedToken: 'correct-token',
      expectedToken: 'correct-token',
    }),
    'closed',
  );
  assert.equal(
    setupAllowed({
      setupCompleted: false,
      userCount: 0,
      suppliedToken: 'wrong',
      expectedToken: 'correct-token',
    }),
    'token',
  );
  assert.equal(
    setupAllowed({
      setupCompleted: false,
      userCount: 0,
      suppliedToken: '',
      expectedToken: '',
    }),
    'token',
  );
  assert.equal(
    setupAllowed({
      setupCompleted: false,
      userCount: 0,
      suppliedToken: 'correct-token',
      expectedToken: 'correct-token',
    }),
    'ok',
  );
});

void test('reset tokens are single-use, hashed, and expire after 30 minutes', () => {
  const token = createResetToken();
  const other = createResetToken();
  assert.equal(token.length, 43);
  assert.notEqual(token, other);
  assert.notEqual(hashResetToken(token), token);
  assert.equal(hashResetToken(token).length, 64);
  const now = new Date('2026-11-17T15:00:00Z');
  const expiresAt = resetExpiry(now.getTime());
  assert.equal(expiresAt.toISOString(), '2026-11-17T15:30:00.000Z');
  assert.equal(resetTokenUsable({ usedAt: null, expiresAt, now }), true);
  assert.equal(
    resetTokenUsable({ usedAt: now, expiresAt, now: new Date(now) }),
    false,
  );
  assert.equal(
    resetTokenUsable({
      usedAt: null,
      expiresAt,
      now: new Date('2026-11-17T15:30:00Z'),
    }),
    false,
  );
});

void test('account mail is generic and rate limits use fixed windows', () => {
  const message = renderAccountMail({
    kind: 'password_reset',
    url: 'https://sign.example.test/reset?token=example',
    expiresAt: new Date('2026-11-17T15:30:00Z'),
  });
  assert.equal(message.text.includes('Patient'), false);
  assert.equal(message.text.includes('TB'), false);
  assert.equal(message.html.includes('<script'), false);
  assert.match(message.text, /reset\?token=example/);
  assert.equal(FORGOT_MESSAGE.includes('@'), false);
  const start = rateWindowStart(Date.parse('2026-11-17T15:07:00Z'), 15 * 60);
  assert.equal(start.toISOString(), '2026-11-17T15:00:00.000Z');
  assert.equal(rateAllowed(5, 5), true);
  assert.equal(rateAllowed(6, 5), false);
});
