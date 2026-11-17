import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocumentListQuery } from '../lib/document-query.ts';
import {
  completedDownloadAllowed,
  dashboardStatus,
} from '../lib/document-status.ts';
import {
  classifyDocumentSearch,
  normalizeRecipientEmail,
  recipientEmailIndex,
} from '../lib/recipient-index.ts';

const standard = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'standard_user' as const,
  canPublish: false,
};
const admin = {
  id: '22222222-2222-4222-8222-222222222222',
  role: 'admin' as const,
  canPublish: false,
};

void test('dashboard status names match the sending history labels', () => {
  assert.equal(
    dashboardStatus({ status: 'draft', deliveryFailed: false }),
    'Draft',
  );
  assert.equal(
    dashboardStatus({ status: 'sent', deliveryFailed: false }),
    'Sent',
  );
  assert.equal(
    dashboardStatus({ status: 'viewed', deliveryFailed: false }),
    'Viewed',
  );
  assert.equal(
    dashboardStatus({ status: 'partially_signed', deliveryFailed: false }),
    'Viewed',
  );
  assert.equal(
    dashboardStatus({ status: 'completed', deliveryFailed: false }),
    'Completed',
  );
  assert.equal(
    dashboardStatus({ status: 'declined', deliveryFailed: false }),
    'Declined',
  );
  assert.equal(
    dashboardStatus({ status: 'expired', deliveryFailed: false }),
    'Expired',
  );
  assert.equal(
    dashboardStatus({ status: 'voided', deliveryFailed: false }),
    'Canceled',
  );
  assert.equal(
    dashboardStatus({ status: 'sent', deliveryFailed: true }),
    'Failed',
  );
  assert.equal(
    dashboardStatus({ status: 'partially_signed', deliveryFailed: true }),
    'Viewed',
  );
});

void test('recipient search is an exact keyed index, not a text match', () => {
  assert.equal(
    normalizeRecipientEmail('  Ada@Example.TEST '),
    'ada@example.test',
  );
  const first = recipientEmailIndex('Ada@Example.TEST', 'lookup-secret');
  const second = recipientEmailIndex('ada@example.test', 'lookup-secret');
  const other = recipientEmailIndex('ada@example.test', 'other-secret');
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.equal(first.includes('ada@example.test'), false);
  assert.deepEqual(classifyDocumentSearch('ada@example.test'), {
    email: 'ada@example.test',
    text: null,
  });
  assert.deepEqual(classifyDocumentSearch('contractor agreement'), {
    email: null,
    text: 'contractor agreement',
  });
});

void test('personal history cannot query another employee and email is not a LIKE', () => {
  const own = buildDocumentListQuery({
    user: standard,
    q: 'ada@example.test',
    emailIndex: 'abc123',
    sort: 'title; drop table envelopes',
    page: 2,
  });
  assert.match(own.sql, /e\.created_by = \?/);
  assert.equal(own.params[0], standard.id);
  assert.match(own.sql, /email_lookup = \?/);
  assert.equal(own.sql.includes('LIKE'), false);
  assert.equal(own.sql.includes('drop table'), false);
  assert.equal(own.params.includes('abc123'), true);
  assert.match(
    own.sql,
    /ORDER BY COALESCE\(e\.locked_at, e\.created_at\) DESC/,
  );
  assert.deepEqual(own.params.slice(-2), [25, 25]);
  const titled = buildDocumentListQuery({
    user: standard,
    sort: 'title',
    direction: 'asc',
  });
  assert.match(titled.sql, /ORDER BY e\.title ASC/);

  const organization = buildDocumentListQuery({
    user: admin,
    employeeId: standard.id,
    status: 'Canceled',
    templateId: '33333333-3333-4333-8333-333333333333',
    from: '2026-01-01',
    to: '2026-01-31',
  });
  assert.equal(organization.sql.includes('drop table'), false);
  assert.equal(organization.params.includes(standard.id), true);
  assert.equal(organization.params.includes('Canceled'), true);
  assert.match(organization.countSql, /COUNT\(\*\)/);
});

void test('completed files are limited to the owner or an administrator', () => {
  assert.equal(
    completedDownloadAllowed({
      isAdmin: false,
      sameOwner: true,
      status: 'completed',
    }),
    true,
  );
  assert.equal(
    completedDownloadAllowed({
      isAdmin: false,
      sameOwner: false,
      status: 'completed',
    }),
    false,
  );
  assert.equal(
    completedDownloadAllowed({
      isAdmin: true,
      sameOwner: false,
      status: 'completed',
    }),
    true,
  );
  assert.equal(
    completedDownloadAllowed({
      isAdmin: true,
      sameOwner: true,
      status: 'sent',
    }),
    false,
  );
});
