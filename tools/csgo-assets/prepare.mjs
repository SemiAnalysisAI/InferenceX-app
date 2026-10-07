import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { atomicWrite, download, safePath, validLocal, verify } from './asset-io.mjs';

const root = import.meta.dirname;
const lock = JSON.parse(await readFile(join(root, 'assets-lock.json'), 'utf8'));
const check = process.argv.includes('--check');
const modelsOnly = process.argv.includes('--models-only');
if (process.argv.slice(2).some((arg) => !['--check', '--models-only'].includes(arg))) {
  throw new Error('Usage: node prepare.mjs [--check] [--models-only]');
}
const entries = lock.files.filter((entry) => !modelsOnly || entry.kind === 'model');
let archive;
let reused = 0;
let restored = 0;
const missing = [];

for (const entry of entries) {
  const target = safePath(join(root, 'assets'), entry.path);
  if (await validLocal(target, entry)) {
    reused++;
    continue;
  }
  if (check) {
    missing.push(entry.path);
    continue;
  }
  let bytes;
  if (entry.kind === 'model') {
    if (!archive) {
      archive = safePath(root, '.cache/workbench.zip');
      const archiveEntry = { path: 'workbench.zip', ...lock.archive };
      if (!(await validLocal(archive, archiveEntry))) {
        const zip = await download(lock.archive.url, lock.archive.bytes);
        verify(zip, archiveEntry);
        await atomicWrite(archive, zip);
      }
    }
    // Extract only allowlisted members; never unpack archive paths onto disk.
    bytes = execFileSync('unzip', ['-p', archive, entry.member], { maxBuffer: entry.bytes + 1024 });
  } else {
    bytes = await download(`${lock.audio.baseUrl}/${entry.sourcePath}`, entry.bytes);
  }
  verify(bytes, entry);
  await atomicWrite(target, bytes);
  restored++;
  if (restored % 50 === 0) console.log(`Restored ${restored}/${entries.length} files`);
}
console.log(JSON.stringify({ checked: entries.length, reused, restored, missing }, null, 2));
if (missing.length > 0) process.exitCode = 1;
