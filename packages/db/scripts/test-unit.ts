// Runs the db unit tests: builds the migrated PGlite template once, then fans `bun test` out to
// workers that each load it. Extra arguments (e.g. --coverage) pass through to `bun test`.
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import path from 'node:path';

import { pgliteTemplate } from '../src/lib/test-pglite-template';

await pgliteTemplate();

// PGlite files are CPU-bound and need fast cores: half the CPUs on an 18-core Apple chip (6 fast
// cores) timed tests out in 1 of 2 runs; a third was green 10 of 10 and no slower.
const workers = Math.max(1, Math.floor(availableParallelism() / 3));
const { status } = spawnSync(
  process.execPath,
  ['test', `--parallel=${workers}`, ...process.argv.slice(2)],
  { cwd: path.join(import.meta.dirname, '..'), stdio: 'inherit' },
);
process.exitCode = status ?? 1;
