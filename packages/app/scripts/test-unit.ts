// Runs the app unit tests on bun:test. Files marked `// @test-environment jsdom` run in a second
// pass with a jsdom window preloaded; the rest run without DOM globals, as server code does.
// Arguments that are not flags filter files by path substring; flags (e.g. --coverage) pass through.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { globSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import path from 'node:path';

import { passFailed, stallWatchdogEnabled } from '../src/lib/testing/unit-test-runner';

const root = path.join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const filters = args.filter((arg) => !arg.startsWith('-'));
const flags = args.filter((arg) => arg.startsWith('-'));

const files = globSync('src/**/*.test.{ts,tsx}', { cwd: root })
  .filter((file) => filters.length === 0 || filters.some((filter) => file.includes(filter)))
  .toSorted();
if (files.length === 0) {
  console.error(`No test files match ${filters.join(', ')}`);
  process.exit(1);
}
const isDom = (file: string) =>
  /^\/\/ @test-environment jsdom$/m.test(readFileSync(path.join(root, file), 'utf8'));
const dom = files.filter(isDom);
const node = files.filter((file) => !dom.includes(file));

// Half the CPUs: on an 18-core machine, more workers do not finish any sooner.
const workers = Math.max(1, Math.floor(availableParallelism() / 2));
const coverage = flags.includes('--coverage');

// bun applies no timeout while a test file loads, so an import that never settles would hold its
// worker until CI cancels the job. A pass in which no file starts or finishes for this long is
// stopped instead. The slowest file takes about 6 s under load.
const stallMs = 60_000;
const watched = stallWatchdogEnabled(flags, process.env);

/** Runs one bun test pass. `stalled` means the watchdog stopped it. */
async function runPass(name: string, preloads: readonly string[], group: readonly string[]) {
  // src/test/heartbeat.ts appends to this file whenever a test file starts or ends.
  const directory = mkdtempSync(path.join(tmpdir(), 'app-unit-'));
  const heartbeat = path.join(directory, 'heartbeat');
  writeFileSync(heartbeat, '');
  const child = spawn(
    process.execPath,
    [
      'test',
      `--parallel=${workers}`,
      ...['./src/test/heartbeat.ts', ...preloads].flatMap((preload) => ['--preload', preload]),
      ...flags,
      // Each pass writes its own report; one shared directory would keep only the last pass.
      ...(coverage ? [`--coverage-dir=coverage/${name}`] : []),
      ...group.map((file) => `./${file}`),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      // Unit tests must not depend on a developer's .env; this keeps source lookups at their defaults.
      env: { ...process.env, INFERENCEX_SOURCE_REPOS: '', UNIT_TEST_HEARTBEAT: heartbeat },
    },
  );
  let stalled = false;
  const watchdog = setInterval(() => {
    if (!watched || Date.now() - statSync(heartbeat).mtimeMs < stallMs) return;
    stalled = true;
    clearInterval(watchdog);
    console.error(
      `\nThe ${name} pass stopped: no test file started or finished for ${stallMs / 1000} s.`,
    );
    // On SIGTERM bun test lists the files still running and stops its workers, including one
    // blocked in native code.
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
  }, 1_000);
  const [code] = (await once(child, 'exit')) as [number | null];
  clearInterval(watchdog);
  rmSync(directory, { recursive: true, force: true });
  return { passed: !passFailed(code, stalled), stalled };
}

let failed = false;
for (const [name, preloads, group] of [
  ['node', ['./src/test/setup.ts'], node],
  ['jsdom', ['./src/test/setup-dom.ts', './src/test/setup.ts'], dom],
] as const) {
  if (group.length === 0) continue;
  const { passed, stalled } = await runPass(name, preloads, group);
  if (!passed) failed = true;
  if (stalled) break;
}
process.exitCode = failed ? 1 : 0;
