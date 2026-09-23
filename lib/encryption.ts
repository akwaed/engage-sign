import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const VERSION = 1;
const ALGORITHM = 'aes-256-gcm';

function key(): Buffer {
  const encoded = process.env.ENCRYPTION_KEY_V1;
  if (!encoded)
    throw new Error('ENCRYPTION_KEY_V1 is required for signing data.');
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length !== 32 || raw.toString('base64') !== encoded)
    throw new Error('ENCRYPTION_KEY_V1 must be a base64-encoded 32-byte key.');
  return raw;
}

export function encryptValue(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return `v${VERSION}.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptValue(value: string, context: string) {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== `v${VERSION}`)
    throw new Error('Unsupported encrypted value version.');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  if (iv.length !== 12 || tag.length !== 16)
    throw new Error('Encrypted value is malformed.');
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function valueHash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
