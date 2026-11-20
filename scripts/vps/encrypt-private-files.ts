import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import {
  decryptFileIfNeeded,
  encryptFile,
  fileEncryptionKey,
  isEncryptedFile,
} from '../../lib/file-encryption';

if (!process.argv.includes('--confirm'))
  throw new Error(
    'Pass --confirm to encrypt private PDFs. This does not run automatically.',
  );
if (!fileEncryptionKey())
  throw new Error(
    'FILE_ENCRYPTION_KEY_V1 must be set before encrypting stored PDFs.',
  );
const root = process.env.PRIVATE_STORAGE_PATH;
if (!root) throw new Error('PRIVATE_STORAGE_PATH must be set.');

let changed = 0;
for (const kind of ['templates', 'documents']) {
  const dir = join(root, kind);
  const owners = await readdir(dir).catch(() => []);
  for (const owner of owners) {
    const files = await readdir(join(dir, owner)).catch(() => []);
    for (const name of files) {
      if (!name.endsWith('.pdf')) continue;
      const path = join(dir, owner, name);
      const bytes = new Uint8Array(await readFile(path));
      if (isEncryptedFile(bytes)) continue;
      const key = relative(root, path);
      const encrypted = encryptFile(bytes, key);
      const temporary = `${path}.enc-tmp`;
      await writeFile(temporary, encrypted, { mode: 0o600 });
      const roundTrip = decryptFileIfNeeded(
        new Uint8Array(await readFile(temporary)),
        key,
      );
      if (Buffer.compare(Buffer.from(roundTrip), Buffer.from(bytes)) !== 0)
        throw new Error(`Encrypted file did not round-trip: ${key}`);
      await rename(temporary, path);
      changed += 1;
    }
  }
}
console.log(
  `Encrypted ${changed} plaintext PDF files. Existing ciphertext was left unchanged.`,
);
