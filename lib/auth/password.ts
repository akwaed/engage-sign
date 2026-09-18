import 'server-only';

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

export function validatePassword(password: string): string | null {
  if (password.length < 14)
    return 'Use at least 14 characters for the password.';
  if (password.length > 200) return 'The password is too long.';
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    'scrypt-v1',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  storedHash: string | null,
): Promise<boolean> {
  if (!storedHash) return false;
  const [version, cost, blockSize, parallelization, saltText, keyText] =
    storedHash.split('$');
  if (
    version !== 'scrypt-v1' ||
    !cost ||
    !blockSize ||
    !parallelization ||
    !saltText ||
    !keyText
  )
    return false;

  try {
    const expected = Buffer.from(keyText, 'base64url');
    const actual = await scrypt(
      password,
      Buffer.from(saltText, 'base64url'),
      expected.length,
      {
        N: Number(cost),
        r: Number(blockSize),
        p: Number(parallelization),
        maxmem: 64 * 1024 * 1024,
      },
    );
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
