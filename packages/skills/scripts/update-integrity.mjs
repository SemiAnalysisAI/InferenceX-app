import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = new URL('../', import.meta.url);

async function generatedIntegrity(root = packageRoot) {
  const skillRoot = new URL('skills/inferencex-api/', root);
  const skillRootPath = fileURLToPath(skillRoot);
  const metadata = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
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
  return `${JSON.stringify(
    {
      schema_version: 1,
      package_version: metadata.version,
      files,
    },
    null,
    2,
  )}\n`;
}

export async function checkIntegrity(root = packageRoot) {
  const expected = await generatedIntegrity(root);
  const integrityPath = new URL('skills/inferencex-api/integrity.json', root);
  let actual;
  try {
    actual = await readFile(integrityPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (actual !== expected) {
    throw new Error(
      'Packaged skill integrity manifest is stale; run node packages/skills/scripts/update-integrity.mjs and commit the refreshed manifest',
    );
  }
}

async function main(args) {
  if (args.length === 0) {
    await writeFile(
      new URL('skills/inferencex-api/integrity.json', packageRoot),
      await generatedIntegrity(),
    );
    return;
  }
  if (args.length === 1 && args[0] === '--check') {
    await checkIntegrity();
    return;
  }
  throw new Error('Usage: update-integrity.mjs [--check]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
