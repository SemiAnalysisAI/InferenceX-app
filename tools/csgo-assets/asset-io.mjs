import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

export function digest(bytes, algorithm = 'sha256') {
  return createHash(algorithm).update(bytes).digest('hex');
}

export function gitBlobDigest(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

export function safePath(root, relative) {
  if (
    !/^[a-zA-Z0-9_./-]+$/.test(relative) ||
    relative.split('/').some((s) => !s || s === '.' || s === '..')
  ) {
    throw new Error(`Unsafe asset path: ${relative}`);
  }
  const result = resolve(root, relative);
  if (!result.startsWith(resolve(root) + sep))
    throw new Error(`Path escapes asset root: ${relative}`);
  return result;
}

export async function rejectSymlinks(path) {
  let current = resolve(path);
  while (true) {
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Symlink not allowed: ${current}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function verify(bytes, entry) {
  if (bytes.length !== entry.bytes) throw new Error(`Size mismatch: ${entry.path}`);
  if (entry.sha256 && digest(bytes) !== entry.sha256)
    throw new Error(`SHA-256 mismatch: ${entry.path}`);
  if (entry.gitBlob && gitBlobDigest(bytes) !== entry.gitBlob)
    throw new Error(`Git blob mismatch: ${entry.path}`);
  if (!entry.sha256 && !entry.gitBlob) throw new Error(`Missing digest: ${entry.path}`);
  if (
    entry.path.endsWith('.wav') &&
    (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
  ) {
    throw new Error(`Not a RIFF/WAVE file: ${entry.path}`);
  }
  if (
    entry.path.endsWith('.obj') &&
    (!/^v\s/m.test(bytes.toString()) || !/^f\s/m.test(bytes.toString()))
  ) {
    throw new Error(`Missing OBJ geometry: ${entry.path}`);
  }
}

export async function atomicWrite(path, bytes) {
  await rejectSymlinks(path);
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${randomUUID()}.part`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export async function validLocal(path, entry) {
  await rejectSymlinks(path);
  try {
    verify(await readFile(path), entry);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT' || /mismatch|Missing OBJ|Not a RIFF/.test(error.message))
      return false;
    throw error;
  }
}

export async function download(url, maxBytes, fetcher = fetch) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' ||
    !['media.steampowered.com', 'raw.githubusercontent.com'].includes(parsed.hostname)
  ) {
    throw new Error(`Unapproved asset host: ${url}`);
  }
  const response = await fetcher(url, { signal: AbortSignal.timeout(60000), redirect: 'error' });
  if (!response.ok || !response.body)
    throw new Error(`Download failed: HTTP ${response.status} ${url}`);
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error(`Download exceeds expected size: ${url}`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
