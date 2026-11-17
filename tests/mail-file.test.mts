import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readFileSync } from 'node:fs';
import { writeOutgoingMail } from '../lib/mail-file.ts';
import { deliveryOrigin, resolveMailTransport } from '../lib/mail-transport.ts';

const production = {
  NODE_ENV: 'production',
  APP_URL: 'https://sign.engagess.co',
  MAIL_TRANSPORT: 'file',
  MAIL_FILE_DIR: '/var/lib/engage-sign-staging/mail',
  ENGAGE_ALLOW_FILE_MAIL: 'true',
};

void test('mail uses SMTP unless file transport is selected', () => {
  assert.deepEqual(resolveMailTransport({}), { mode: 'smtp' });
  assert.deepEqual(
    resolveMailTransport({
      NODE_ENV: 'production',
      APP_URL: 'https://sign.engagess.co',
      MAIL_TRANSPORT: 'smtp',
    }),
    { mode: 'smtp' },
  );
});

void test('file mail refuses production and stays off without the allow flag', () => {
  assert.throws(
    () => resolveMailTransport(production),
    /https:\/\/sign\.engagess\.co/,
  );
  assert.throws(
    () =>
      resolveMailTransport({
        ...production,
        APP_URL: 'http://localhost:3001',
        ENGAGE_ALLOW_FILE_MAIL: undefined,
      }),
    /ENGAGE_ALLOW_FILE_MAIL/,
  );
  assert.throws(
    () =>
      resolveMailTransport({
        NODE_ENV: 'development',
        APP_URL: 'http://localhost:3001',
        MAIL_TRANSPORT: 'file',
      }),
    /MAIL_FILE_DIR/,
  );
});

void test('file transport does not require an SMTP port', () => {
  assert.equal(
    deliveryOrigin({
      MAIL_TRANSPORT: 'file',
      MAIL_FILE_DIR: '/var/lib/engage-sign-staging/mail',
      APP_URL: 'http://localhost:3001',
      NODE_ENV: 'production',
      ENGAGE_ALLOW_FILE_MAIL: 'true',
      SMTP_PORT: '2525',
    }),
    'http://localhost:3001',
  );
  assert.throws(
    () =>
      deliveryOrigin({
        MAIL_TRANSPORT: 'smtp',
        APP_URL: 'https://sign.example.test',
        SMTP_HOST: 'smtp.office365.com',
        SMTP_USER: 'user',
        SMTP_PASSWORD: 'secret',
        SMTP_FROM: 'sign@example.test',
        SMTP_PORT: '2525',
      }),
    /SMTP_PORT must be 587/,
  );
});

void test('a fresh database still receives the setup settings row', () => {
  const sql = readFileSync(
    new URL('../database/mysql/migrations/004_auth_rbac.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /INSERT INTO system_settings/);
  assert.match(
    sql,
    /WHERE NOT EXISTS \(SELECT 1 FROM system_settings WHERE id = 'global'\)/,
  );
  assert.equal(
    sql.includes('WHERE EXISTS (SELECT 1 FROM users)\n   AND NOT EXISTS'),
    false,
  );
});

void test('file mail writes the recipient, subject, and link', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'engage-mail-'));
  try {
    const transport = resolveMailTransport({
      NODE_ENV: 'production',
      APP_URL: 'http://localhost:3001',
      MAIL_TRANSPORT: 'file',
      MAIL_FILE_DIR: directory,
      ENGAGE_ALLOW_FILE_MAIL: 'true',
    });
    assert.equal(transport.mode, 'file');
    if (transport.mode !== 'file') return;
    const link = 'http://localhost:3001/reset?token=example-token';
    const receipt = await writeOutgoingMail(transport.directory, {
      to: 'signer@example.test',
      from: 'sign@example.test',
      subject: 'Engage Sign: reset your password',
      text: `Set your password:\n${link}\n`,
      html: `<a href="${link}">Set password</a>`,
    });
    assert.equal(receipt, 'file-mail');
    const [name] = await readdir(directory);
    const written = await readFile(join(directory, name), 'utf8');
    assert.match(written, /To: signer@example\.test/);
    assert.match(written, /Subject: Engage Sign: reset your password/);
    assert.match(written, /reset\?token=example-token/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
