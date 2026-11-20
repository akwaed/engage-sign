import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('ESENC1');
const VERSION = 1;

export function fileEncryptionKey(value = process.env.FILE_ENCRYPTION_KEY_V1) {
  if (!value) return null;
  const raw = Buffer.from(value, 'base64');
  if (raw.length !== 32 || raw.toString('base64') !== value)
    throw new Error(
      'FILE_ENCRYPTION_KEY_V1 must be a base64-encoded 32-byte key.',
    );
  return raw;
}

export function isEncryptedFile(bytes: Uint8Array) {
  return Buffer.from(bytes.subarray(0, MAGIC.length)).equals(MAGIC);
}

export function encryptFile(bytes: Uint8Array, aad: string) {
  const key = fileEncryptionKey();
  if (!key) return bytes;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return new Uint8Array(
    Buffer.concat([
      MAGIC,
      Buffer.from([VERSION]),
      iv,
      cipher.getAuthTag(),
      encrypted,
    ]),
  );
}

export function decryptFileIfNeeded(bytes: Uint8Array, aad: string) {
  if (!isEncryptedFile(bytes)) return bytes;
  const key = fileEncryptionKey();
  if (!key)
    throw new Error(
      'FILE_ENCRYPTION_KEY_V1 is required to read encrypted files.',
    );
  const version = bytes[MAGIC.length];
  if (version !== VERSION)
    throw new Error('Unsupported file encryption version.');
  const ivStart = MAGIC.length + 1;
  const iv = Buffer.from(bytes.subarray(ivStart, ivStart + 12));
  const tag = Buffer.from(bytes.subarray(ivStart + 12, ivStart + 28));
  const body = Buffer.from(bytes.subarray(ivStart + 28));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return new Uint8Array(
    Buffer.concat([decipher.update(body), decipher.final()]),
  );
}
