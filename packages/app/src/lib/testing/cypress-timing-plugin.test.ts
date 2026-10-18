import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const splitAfterRun = vi.hoisted(() => vi.fn());
vi.mock('cypress-split', () => ({
  default: (on: Cypress.PluginEvents) => {
    on('after:run', splitAfterRun);
    on('before:run', () => {});
  },
}));
vi.mock('./cypress-source-fingerprint', () => ({
  cypressSourceFingerprint: () => 'current-source',
}));

import { setupTimingSplit } from '../../../cypress/plugins/timings';

const temporary: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function harness() {
  const directory = mkdtempSync(join(tmpdir(), 'cypress-observation-'));
  temporary.push(directory);
  const output = join(directory, 'nested', 'observation.json');
  vi.stubEnv('CYPRESS_TIMING_OUTPUT', output);
  vi.stubEnv('SPLIT', '8');
  vi.stubEnv('SPLIT_INDEX1', '3');
  vi.stubEnv('GITHUB_SHA', 'revision');
  vi.stubEnv('GITHUB_RUN_ID', 'run');
  vi.stubEnv('GITHUB_RUN_ATTEMPT', '2');
  const events = new Map<string, (...args: unknown[]) => unknown>();
  const on = ((event: string, callback: (...args: unknown[]) => unknown) => {
    if (events.has(event)) throw new Error(`Overwritten Cypress handler: ${event}`);
    events.set(event, callback);
  }) as Cypress.PluginEvents;
  setupTimingSplit(on, { testingType: 'e2e' } as Cypress.PluginConfigOptions);
  return { output, events };
}

const runResult = () => ({
  browserName: 'firefox',
  totalFailed: 0,
  totalPending: 0,
  totalSkipped: 0,
  totalPassed: 1,
  runs: [
    {
      error: null,
      spec: { relative: 'cypress/e2e/example.cy.ts' },
      stats: { duration: 123 },
      tests: [
        {
          title: ['suite', 'test'],
          state: 'passed',
          duration: 45,
          attempts: [{ state: 'passed' }],
        },
      ],
    },
  ],
});

describe('Cypress timing event integration', () => {
  it('composes plugin handlers and records Cypress 15 spec and test durations', async () => {
    const { output, events } = harness();
    const results = runResult();
    await events.get('after:run')!(results);
    expect(events.has('before:run')).toBe(true);
    expect(splitAfterRun).toHaveBeenCalledWith(results);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
      schemaVersion: 1,
      kind: 'e2e',
      browser: 'firefox',
      revision: 'revision',
      runId: 'run',
      runAttempt: '2',
      sourceHash: 'current-source',
      shards: 8,
      shard: 3,
      passed: true,
      durations: [
        {
          spec: 'cypress/e2e/example.cy.ts',
          duration: 123,
          tests: [{ title: ['suite', 'test'], duration: 45, attempts: 1 }],
        },
      ],
    });
  });

  it.each(['totalFailed', 'totalPending', 'totalSkipped'])(
    'does not qualify a run with %s',
    async (counter) => {
      const { output, events } = harness();
      await events.get('after:run')!({ ...runResult(), [counter]: 1 });
      expect(JSON.parse(readFileSync(output, 'utf8')).passed).toBe(false);
    },
  );

  it('rejects a runner failure instead of inventing timings', async () => {
    const { events } = harness();
    await expect(events.get('after:run')!({ status: 'failed', failures: 1 })).rejects.toThrow(
      'did not return test results',
    );
  });
});
