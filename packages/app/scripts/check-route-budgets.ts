#!/usr/bin/env bun
// Checks each route's first-load JavaScript from the last `next build` against
// scripts/route-bundle-budgets.json. `--update` rewrites every budget to the current size plus the
// file's tolerance. See docs/testing.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  checkRouteBudgets,
  updatedRouteBudgets,
  type RouteBudgets,
  type RouteBundleStat,
} from '../src/lib/testing/route-budget-gate';

const STATS_PATH = path.resolve(
  import.meta.dirname,
  '../.next/diagnostics/route-bundle-stats.json',
);
const BUDGETS_PATH = path.join(import.meta.dirname, 'route-bundle-budgets.json');

if (!existsSync(STATS_PATH)) {
  console.error(`check-route-budgets: ${STATS_PATH} is missing. Run \`bun run build\` first.`);
  process.exit(1);
}
const stats: RouteBundleStat[] = JSON.parse(readFileSync(STATS_PATH, 'utf8'));
const budgets: RouteBudgets = JSON.parse(readFileSync(BUDGETS_PATH, 'utf8'));

if (process.argv.includes('--update')) {
  const updated = updatedRouteBudgets(stats, budgets);
  writeFileSync(BUDGETS_PATH, `${JSON.stringify(updated, null, 2)}\n`);
  console.log(
    `check-route-budgets: ${Object.keys(updated.routes).length} route budgets set to their size + ${updated.tolerancePercent}%.`,
  );
  process.exit(0);
}

const { errors, stale, slack } = checkRouteBudgets(stats, budgets);

if (errors.length > 0) {
  console.error('check-route-budgets: first-load JS grew past the route budget:\n');
  for (const error of errors) console.error(`  ${error}`);
  console.error(
    [
      '',
      'Keep code a first render does not need out of the route (next/dynamic, import() on use).',
      'If the growth is intended, rebuild with E2E_FIXTURES=1, raise the budget with',
      '`bun run check:route-budgets --update` and say why in the PR.',
    ].join('\n'),
  );
}
if (stale.length > 0) {
  console.error('\ncheck-route-budgets: budgets name routes the build no longer has:\n');
  for (const route of stale) console.error(`  ${route}`);
  console.error('\nRemove them with `bun run check:route-budgets --update`.');
}
if (errors.length > 0 || stale.length > 0) process.exit(1);

if (slack.length > 0) {
  console.log(
    `check-route-budgets: ${slack.length} route(s) shrank below their budget. Ratchet down with \`bun run check:route-budgets --update\`:`,
  );
  for (const line of slack) console.log(`  ${line}`);
}
console.log(`check-route-budgets: OK, ${stats.length} routes within budget.`);
