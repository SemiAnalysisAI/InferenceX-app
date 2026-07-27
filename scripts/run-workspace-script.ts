import { spawn, type ChildProcess } from 'node:child_process';
import { glob, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

interface PackageManifest {
  name?: string;
  scripts?: Record<string, string>;
  workspaces?: string[];
}

const [scriptName, ...scriptArgs] = process.argv.slice(2);

if (!scriptName) {
  console.error('Usage: bun scripts/run-workspace-script.ts <script> [...args]');
  process.exit(1);
}

const rootDir = resolve(import.meta.dirname, '..');

async function readManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path, 'utf8')) as PackageManifest;
}

function waitForExit(process: ChildProcess): Promise<number> {
  const { promise, resolve: resolveExit, reject } = Promise.withResolvers<number>();
  process.once('error', reject);
  process.once('exit', (code) => resolveExit(code ?? 1));
  return promise;
}

const rootPackage = await readManifest(resolve(rootDir, 'package.json'));
if (!rootPackage.workspaces) {
  throw new Error('Expected package.json workspaces to be an array');
}

const manifestPaths: string[] = [];
for (const pattern of rootPackage.workspaces) {
  for await (const path of glob(`${pattern}/package.json`, { cwd: rootDir })) {
    manifestPaths.push(path);
  }
}

for (const manifestPath of manifestPaths.toSorted()) {
  const packageDir = dirname(resolve(rootDir, manifestPath));
  const workspacePackage = await readManifest(resolve(rootDir, manifestPath));
  if (!workspacePackage.scripts?.[scriptName]) continue;

  console.log(`\n> ${workspacePackage.name ?? manifestPath} ${scriptName}\n`);
  const args = ['run', scriptName, ...scriptArgs];

  const child = spawn('bun', args, {
    cwd: packageDir,
    stdio: 'inherit',
  });
  const exitCode = await waitForExit(child);
  if (exitCode !== 0) process.exit(exitCode);
}
