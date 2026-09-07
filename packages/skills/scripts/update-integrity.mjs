import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = new URL('../', import.meta.url);
const skillRoot = new URL('skills/inferencex-api/', packageRoot);
const skillRootPath = fileURLToPath(skillRoot);
const metadata = JSON.parse(await readFile(new URL('package.json', packageRoot), 'utf8'));
const files = {};

async function visit(relative = '') {
  const directory = join(skillRootPath, ...relative.split('/').filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  for (const entry of entries) {
    const path = relative === '' ? entry.name : posix.join(relative, entry.name);
    if (path === 'integrity.json') continue;
    if (entry.isSymbolicLink())
      throw new Error(`Packaged skill path must not be a symlink: ${path}`);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!entry.isFile()) throw new Error(`Packaged skill path must be a regular file: ${path}`);
    files[path] = createHash('sha256')
      .update(await readFile(join(skillRootPath, ...path.split('/'))))
      .digest('hex');
  }
}

await visit();
await writeFile(
  new URL('integrity.json', skillRoot),
  `${JSON.stringify(
    {
      schema_version: 1,
      package_version: metadata.version,
      files,
    },
    null,
    2,
  )}\n`,
);
