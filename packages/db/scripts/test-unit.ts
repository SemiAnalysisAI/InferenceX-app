// Runs the db unit tests: builds the migrated PGlite template once, then fans `bun test` out to
// workers that each load it. Extra arguments (e.g. --coverage) pass through to `bun test`.
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';

import { pgliteTemplate } from '../src/lib/test-pglite-template';

await pgliteTemplate();

// PGlite files are CPU-bound; one worker per CPU starves their hooks past the 5 s timeout.
const workers = Math.max(1, Math.floor(availableParallelism() / 2));
const { status } = spawnSync(
  process.execPath,
  ['test', `--parallel=${workers}`, ...process.argv.slice(2)],
  { cwd: path.join(import.meta.dirname, '..'), stdio: 'inherit' },
);
process.exitCode = status ?? 1;
