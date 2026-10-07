import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safePath, validLocal, verify } from './asset-io.mjs';

const exec = promisify(execFile);
export function validateArchiveListing(names, verbose, entries) {
  const expected = new Set(entries.map((entry) => entry.path));
  const found = new Set();
  for (const name of names.trim().split('\n')) {
    const path = name.endsWith('/') ? name.slice(0, -1) : name;
    safePath('/asset-root', path);
    if (name.endsWith('/')) {
      if (!entries.some((entry) => entry.path.startsWith(name)))
        throw new Error('Unknown archive directory');
    } else {
      if (!expected.has(path) || found.has(path)) throw new Error('Unexpected archive member');
      found.add(path);
    }
  }
  if (found.size !== expected.size) throw new Error('Incomplete archive');
  if (
    verbose
      .trim()
      .split('\n')
      .some((line) => !['-', 'd'].includes(line[0]))
  ) {
    throw new Error('Archive links and special files are forbidden');
  }
}
export async function verifiedAssets(root, entries) {
  for (const entry of entries) {
    if (!(await validLocal(safePath(root, entry.path), entry))) return false;
  }
  return true;
}
export async function downloadArchive(config, parts, destination, fetcher = fetch) {
  const base = new URL(config.baseUrl);
  if (
    base.origin !== 'https://raw.githubusercontent.com' ||
    !/^\/SemiAnalysisAI\/InferenceX-app\/[a-f0-9]{40}\/$/.test(base.pathname)
  )
    throw new Error('Asset distribution must use a pinned repository commit');
  if (parts.reduce((sum, part) => sum + part.bytes, 0) !== config.bytes) {
    throw new Error('Archive part sizes do not match');
  }
  const output = createWriteStream(destination, { flags: 'wx' });
  const hash = createHash('sha256');
  let failure;
  output.on('error', (error) => {
    failure = error;
  });
  try {
    for (const part of parts) {
      safePath('/asset-root', part.path);
      const response = await fetcher(new URL(part.path, base), {
        redirect: 'error',
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok || !response.body)
        throw new Error(`Asset download failed: ${response.status}`);
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > part.bytes) throw new Error('Oversized asset part');
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      verify(bytes, part);
      hash.update(bytes);
      if (failure) throw failure;
      if (!output.write(bytes)) await once(output, 'drain');
    }
    output.end();
    await once(output, 'finish');
    if (failure) throw failure;
    if (hash.digest('hex') !== config.sha256) throw new Error('Archive SHA-256 mismatch');
  } catch (error) {
    output.destroy();
    await rm(destination, { force: true });
    throw error;
  }
}
export async function restoreSiteAssets(localRoot, cacheRoot, config, parts, entries) {
  if (await verifiedAssets(localRoot, entries)) return localRoot;
  await mkdir(cacheRoot, { recursive: true });
  const restored = join(cacheRoot, config.sha256);
  if (await verifiedAssets(restored, entries)) return restored;
  const temporary = await mkdtemp(join(cacheRoot, 'restore-'));
  const archive = join(temporary, 'assets.tar.gz');
  try {
    await downloadArchive(config, parts, archive);
    const options = { maxBuffer: 8 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' } };
    const names = await exec('tar', ['-tzf', archive], options);
    const verbose = await exec('tar', ['-tvzf', archive], options);
    validateArchiveListing(names.stdout, verbose.stdout, entries);
    await rm(restored, { recursive: true, force: true });
    await mkdir(restored, { recursive: true });
    await exec(
      'tar',
      ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', restored],
      options,
    );
    if (!(await verifiedAssets(restored, entries)))
      throw new Error('Restored asset verification failed');
    return restored;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
