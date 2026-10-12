import { globSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  mergeTimingObservations,
  timingBalance,
  type TimingObservation,
} from '../src/lib/testing/cypress-timing-data';

const app = resolve(import.meta.dirname, '..');
const input = process.argv[2];
if (!input) throw new Error('Usage: bun scripts/refresh-cypress-timings.ts <artifact-directory>');
const observations = globSync('**/*.json', { cwd: resolve(input) }).map(
  (file) => JSON.parse(readFileSync(resolve(input, file), 'utf8')) as TimingObservation,
);
const groups = [
  { kind: 'e2e', browser: 'chrome', shards: 8, output: 'timings.json' },
  { kind: 'e2e', browser: 'firefox', shards: 8, output: 'timings-firefox.json' },
  { kind: 'component', browser: 'chrome', shards: 4, output: 'component-timings.json' },
] as const;
if (observations.length !== groups.reduce((sum, group) => sum + group.shards, 0)) {
  throw new Error('Expected exactly 20 observations from the full browser/component matrix');
}
if (
  new Set(
    observations.map(({ revision, runId, runAttempt }) => `${revision}/${runId}/${runAttempt}`),
  ).size !== 1
) {
  throw new Error('All browser and component observations must come from one workflow attempt');
}
// Validate every group before writing any baseline.
const baselines = groups.map((group) => {
  const specs = globSync(`cypress/${group.kind}/**/*.cy.${group.kind === 'e2e' ? 'ts' : 'tsx'}`, {
    cwd: app,
  });
  const baseline = mergeTimingObservations(
    observations.filter(({ kind, browser }) => kind === group.kind && browser === group.browser),
    specs,
    group,
  );
  return { group, baseline, balance: timingBalance(baseline.durations, group.shards) };
});
for (const { group, baseline } of baselines) {
  writeFileSync(resolve(app, group.output), `${JSON.stringify(baseline, null, 2)}\n`);
}
const report = baselines.map(({ group, balance }) => ({ ...group, ...balance }));
writeFileSync(resolve(app, 'cypress-balance.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
