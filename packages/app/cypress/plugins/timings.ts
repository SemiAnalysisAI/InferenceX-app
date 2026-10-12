import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import cypressSplit from 'cypress-split';

import type { TimingObservation } from '../../src/lib/testing/cypress-timing-data';

export function setupTimingSplit(on: Cypress.PluginEvents, config: Cypress.PluginConfigOptions) {
  const afterRun: ((
    results: CypressCommandLine.CypressRunResult | CypressCommandLine.CypressFailedRunResult,
  ) => unknown)[] = [];
  // Cypress keeps only the last handler for an event. Compose the plugin's
  // after:run handler so recording raw observations cannot disable its output.
  const splitOn = ((event: string, handler: (...args: never[]) => unknown) => {
    if (event === 'after:run') afterRun.push(handler as (typeof afterRun)[number]);
    else on(event as 'task', handler as never);
  }) as Cypress.PluginEvents;
  cypressSplit(splitOn, config);
  on('after:run', async (results) => {
    for (const handler of afterRun) await handler(results);
    const output = process.env.CYPRESS_TIMING_OUTPUT;
    if (!output) return;
    if (!('runs' in results)) throw new Error('Cypress did not return test results');
    const observation: TimingObservation = {
      schemaVersion: 1,
      kind: config.testingType,
      browser: results.browserName,
      revision: process.env.GITHUB_SHA ?? 'local',
      runId: process.env.GITHUB_RUN_ID ?? 'local',
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '1',
      shard: Number(process.env.SPLIT_INDEX1 ?? 1),
      shards: Number(process.env.SPLIT ?? 1),
      passed:
        results.totalFailed === 0 &&
        results.totalPending === 0 &&
        results.totalSkipped === 0 &&
        results.totalPassed > 0 &&
        results.runs.every(
          (run) => !run.error && run.tests.every((test) => test.state === 'passed'),
        ),
      durations: results.runs.map((run) => ({
        spec: run.spec.relative.replaceAll('\\', '/'),
        duration: run.stats.wallClockDuration,
        tests: run.tests.map((test) => ({
          title: test.title,
          duration: test.attempts.reduce(
            (sum, attempt) => sum + (attempt.wallClockDuration ?? 0),
            0,
          ),
          attempts: test.attempts.length,
        })),
      })),
    };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(observation, null, 2)}\n`);
  });
}
