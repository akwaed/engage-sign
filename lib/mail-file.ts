import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
};

export async function writeOutgoingMail(
  directory: string,
  message: OutgoingMail,
) {
  const root = resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}.eml`;
  const path = join(root, name);
  const body = [
    `To: ${message.to}`,
    `From: ${message.from ?? ''}`,
    `Subject: ${message.subject}`,
    '',
    message.text,
    '',
    '----- html -----',
    message.html,
    '',
  ].join('\n');
  await writeFile(path, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return 'file-mail';
}
