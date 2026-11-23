// Runs the app unit tests on bun:test. Files marked `// @test-environment jsdom` run in a second
// pass with a jsdom window preloaded; the rest run without DOM globals, as server code does.
// Arguments that are not flags filter files by path substring; flags (e.g. --coverage) pass through.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { globSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism, constants, tmpdir } from 'node:os';
import path from 'node:path';

import { passFailed, stallClock, stallWatchdogEnabled } from '../src/lib/testing/unit-test-runner';

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
// worker until CI cancels the job. A pass in which no file or test starts or finishes for this long
// is stopped instead. The slowest file takes about 6 s under load.
const stallMs = 60_000;
const watched = stallWatchdogEnabled(flags, process.env);

// bun test runs in its own process group (except on Windows), so a terminal's Ctrl+C reaches only
// this runner, which passes it on once and still removes the pass's temporary directory.
const ownGroup = process.platform !== 'win32';
let interrupted: NodeJS.Signals | undefined;
let stopPass: ((signal: NodeJS.Signals) => void) | undefined;
const interrupt = (signal: NodeJS.Signals) => {
  interrupted = signal;
  stopPass?.(signal);
};
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

/** Runs one bun test pass. `stalled` means the watchdog stopped it. */
async function runPass(name: string, preloads: readonly string[], group: readonly string[]) {
  // src/test/heartbeat.ts appends to this file whenever a test file or a test starts or ends.
  const directory = mkdtempSync(path.join(tmpdir(), 'app-unit-'));
  const heartbeat = path.join(directory, 'heartbeat');
  writeFileSync(heartbeat, '');
  const child = spawn(
    process.execPath,
    [
      'test',
      `--parallel=${workers}`,
      // If bun test itself dies, its workers go with it instead of running on as orphans.
      '--no-orphans',
      ...['./src/test/heartbeat.ts', ...preloads].flatMap((preload) => ['--preload', preload]),
      ...flags,
      // Each pass writes its own report; one shared directory would keep only the last pass.
      ...(coverage ? [`--coverage-dir=coverage/${name}`] : []),
      ...group.map((file) => `./${file}`),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      detached: ownGroup,
      // Unit tests must not depend on a developer's .env; this keeps source lookups at their defaults.
      env: { ...process.env, INFERENCEX_SOURCE_REPOS: '', UNIT_TEST_HEARTBEAT: heartbeat },
    },
  );
  // On SIGTERM or SIGINT bun test lists the files still running and stops its workers, including
  // one blocked in native code. If it does not exit, its process group is killed.
  stopPass = (signal) => {
    child.kill(signal);
    setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (ownGroup && child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    }, 5_000).unref();
  };
  let stalled = false;
  const stalledFor = stallClock(stallMs, performance.now());
  const watchdog = setInterval(() => {
    let size: number | null = null;
    try {
      size = statSync(heartbeat).size;
    } catch {
      // An unreadable heartbeat counts as no progress; the next beat recreates the file.
    }
    if (!watched || !stalledFor(size, performance.now())) return;
    stalled = true;
    clearInterval(watchdog);
    const skipped = name === 'node' && dom.length > 0 ? ' The jsdom pass will not run.' : '';
    console.error(
      `\nThe ${name} pass stopped: no test file or test started or finished for ` +
        `${stallMs / 1000} s.${skipped}`,
    );
    stopPass?.('SIGTERM');
  }, 1_000);
  try {
    const [code] = (await once(child, 'exit')) as [number | null];
    return { passed: !passFailed(code, stalled), stalled };
  } finally {
    clearInterval(watchdog);
    stopPass = undefined;
    rmSync(directory, { recursive: true, force: true });
  }
}

let failed = false;
for (const [name, preloads, group] of [
  ['node', ['./src/test/setup.ts'], node],
  ['jsdom', ['./src/test/setup-dom.ts', './src/test/setup.ts'], dom],
] as const) {
  if (group.length === 0) continue;
  const { passed, stalled } = await runPass(name, preloads, group);
  if (!passed) failed = true;
  if (stalled || interrupted) break;
}
// An interrupted run exits as the signal would have ended it (130 for Ctrl+C).
process.exitCode = interrupted ? 128 + constants.signals[interrupted] : failed ? 1 : 0;
