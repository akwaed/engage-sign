import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

function rootPath() {
  const setting = process.env.PRIVATE_STORAGE_PATH;
  if (!setting || !isAbsolute(setting))
    throw new Error(
      'PRIVATE_STORAGE_PATH must be an absolute private directory.',
    );
  const root = resolve(setting);
  const projectRoot = resolve(process.cwd());
  const fromProject = relative(projectRoot, root);
  if (
    !fromProject ||
    (!fromProject.startsWith('..') && !isAbsolute(fromProject))
  )
    throw new Error(
      'Private storage must be outside the application directory.',
    );
  const publicRoot = resolve(process.cwd(), 'public');
  const fromPublic = relative(publicRoot, root);
  if (!fromPublic || (!fromPublic.startsWith('..') && !isAbsolute(fromPublic)))
    throw new Error('Private storage cannot be inside the public directory.');
  return root;
}

function filePath(key: string) {
  if (!/^[a-z0-9/_-]+\.(docx|pdf|enc|zip)$/i.test(key))
    throw new Error('Invalid private storage key.');
  const root = rootPath();
  const path = resolve(root, key);
  const inside = relative(root, path);
  if (!inside || inside.startsWith('..') || isAbsolute(inside))
    throw new Error('Invalid private storage key.');
  return { root, path };
}

export async function storeTemplateVersion(
  versionId: string,
  extension: 'docx' | 'pdf',
  bytes: Uint8Array,
) {
  return storePrivateObject('templates', versionId, extension, bytes);
}

export async function storePrivateObject(
  kind: 'templates' | 'documents' | 'signatures',
  ownerId: string,
  extension: 'docx' | 'pdf' | 'enc' | 'zip',
  bytes: Uint8Array,
) {
  if (!/^[a-f0-9-]{36}$/i.test(ownerId))
    throw new Error('Invalid private object owner.');
  const key = `${kind}/${ownerId}/${randomUUID()}.${extension}`;
  const { root, path } = filePath(key);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const actualRoot = await realpath(root);
  if (actualRoot !== root)
    throw new Error('Private storage root cannot be a symlink.');
  const directory = resolve(root, kind, ownerId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  return key;
}

export async function readTemplateVersion(key: string) {
  return readPrivateObject(key);
}

export async function readPrivateObject(key: string) {
  const { root, path } = filePath(key);
  const actualRoot = await realpath(root);
  if (actualRoot !== root)
    throw new Error('Private storage root cannot be a symlink.');
  const actualPath = await realpath(path);
  const inside = relative(root, actualPath);
  if (!inside || inside.startsWith('..') || isAbsolute(inside))
    throw new Error('Private storage path escapes its root.');
  return new Uint8Array(await readFile(actualPath));
}

export async function removeTemplateVersion(key: string) {
  return removePrivateObject(key);
}

export async function removePrivateObject(key: string) {
  const { path } = filePath(key);
  await unlink(path);
}
