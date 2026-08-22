import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  ROUTE_BUNDLE_BUDGETS,
  assertRouteBundleBudgets,
  type RouteBundleStat,
} from '../src/lib/route-bundle-budgets';

const defaultDistDir = process.env.NEXT_DIST_DIR?.trim() || '.next';
const diagnosticsPath = resolve(
  process.cwd(),
  process.argv[2] ?? `${defaultDistDir}/diagnostics/route-bundle-stats.json`,
);
const diagnostics = JSON.parse(await readFile(diagnosticsPath, 'utf8')) as RouteBundleStat[];

assertRouteBundleBudgets(diagnostics);
console.log(
  `Route first-load bundle budgets passed for ${Object.keys(ROUTE_BUNDLE_BUDGETS).length} measured routes.`,
);
