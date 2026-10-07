import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { safePath, rejectSymlinks, verify } from './asset-io.mjs';
const root = fileURLToPath(new URL('assets/', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('game-assets-lock.json', import.meta.url)));
for (const entry of manifest.files) {
  const path = safePath(root, entry.path);
  await rejectSymlinks(path);
  const bytes = readFileSync(path);
  verify(bytes, entry);
}
console.log(`Verified ${manifest.files.length} map, navigation and animated weapon files.`);
