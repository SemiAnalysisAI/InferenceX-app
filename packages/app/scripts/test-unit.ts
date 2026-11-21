// Runs the app unit tests on bun:test. Files marked `// @test-environment jsdom` run in a second
// pass with a jsdom window preloaded; the rest run without DOM globals, as server code does.
// Arguments that are not flags filter files by path substring; flags (e.g. --coverage) pass through.
import { spawnSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const filters = args.filter((arg) => !arg.startsWith('-'));
const flags = args.filter((arg) => arg.startsWith('-'));

const files = globSync('src/**/*.test.{ts,tsx}', { cwd: root })
  .filter((file) => filters.length === 0 || filters.some((filter) => file.includes(filter)))
  .toSorted();
const isDom = (file: string) =>
  /^\/\/ @test-environment jsdom$/m.test(readFileSync(path.join(root, file), 'utf8'));
const dom = files.filter(isDom);
const node = files.filter((file) => !dom.includes(file));

// Half the CPUs: on an 18-core machine 9 to 16 workers all finish in about 8 s, while 17 or more
// (bun 1.4.5) hang loading src/lib/video/video-history-store.test.ts.
const workers = Math.max(1, Math.floor(availableParallelism() / 2));
let failed = false;
for (const [preloads, group] of [
  [['./src/test/setup.ts'], node],
  [['./src/test/setup-dom.ts', './src/test/setup.ts'], dom],
] as const) {
  if (group.length === 0) continue;
  const { status } = spawnSync(
    process.execPath,
    [
      'test',
      `--parallel=${workers}`,
      ...preloads.flatMap((preload) => ['--preload', preload]),
      ...flags,
      ...group.map((file) => `./${file}`),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      // Unit tests must not depend on a developer's .env; this keeps source lookups at their defaults.
      env: { ...process.env, INFERENCEX_SOURCE_REPOS: '' },
    },
  );
  if (status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
