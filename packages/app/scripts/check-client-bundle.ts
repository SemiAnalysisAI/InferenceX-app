#!/usr/bin/env bun
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CHUNKS_DIR = path.resolve(import.meta.dirname, '../.next/static/chunks');
const UNUSED_FLOATING_UI_MIDDLEWARE = 'name:"autoPlacement"';

const offenders = readdirSync(CHUNKS_DIR, { recursive: true, encoding: 'utf8' }).filter(
  (file) =>
    file.endsWith('.js') &&
    readFileSync(path.join(CHUNKS_DIR, file), 'utf8').includes(UNUSED_FLOATING_UI_MIDDLEWARE),
);

if (offenders.length > 0) {
  console.error(
    [
      `floating-ui's autoPlacement middleware ships in ${offenders.join(', ')}.`,
      'Nothing in the app uses it, so Turbopack has stopped scope-hoisting Radix Popper with',
      'floating-ui and every middleware ships with the dashboards (about 1.1 KB gzip per route).',
      'This happens when a lazy chunk imports popover users (OptionInfo, ChartButtons) after',
      'Switch or InferenceContext; see QuickFiltersDialog and FrontierPointsPanel.',
    ].join('\n'),
  );
  process.exit(1);
}
console.log('Client bundle check passed: floating-ui is tree-shaken.');
