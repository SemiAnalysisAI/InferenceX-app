import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  mergeTimingObservations,
  timingBalance,
  type TimingObservation,
} from './cypress-timing-data';

interface TimingEntry {
  spec: string;
  duration: number;
}

interface TimingFile {
  durations: TimingEntry[];
}

const appRoot = resolve(import.meta.dirname, '../../..');

function expectBaseline(dir: string, file: string) {
  const specs = readdirSync(resolve(appRoot, dir))
    .filter((name) => name.endsWith('.cy.ts') || name.endsWith('.cy.tsx'))
    .map((name) => `${dir}/${name}`)
    .toSorted();
  const timings = (JSON.parse(readFileSync(resolve(appRoot, file), 'utf8')) as TimingFile)
    .durations;
  expect(timings.map(({ spec }) => spec).toSorted()).toEqual(specs);
  expect(new Set(timings.map(({ spec }) => spec)).size).toBe(timings.length);
  for (const { duration } of timings) {
    expect(Number.isFinite(duration)).toBe(true);
    expect(duration).toBeGreaterThan(0);
  }
}

describe('Cypress split timing baseline', () => {
  it('contains one positive timing for every current integration spec', () => {
    expectBaseline('cypress/e2e', 'timings.json');
  });

  it('contains one positive timing for every current component spec', () => {
    expectBaseline('cypress/component', 'component-timings.json');
  });

  it('contains one positive timing for every Firefox integration spec', () => {
    expectBaseline('cypress/e2e', 'timings-firefox.json');
  });
});

const observation = (shard: number, spec: string, duration: number): TimingObservation => ({
  schemaVersion: 1,
  kind: 'e2e',
  browser: 'chrome',
  revision: 'abc',
  runId: '123',
  runAttempt: '1',
  sourceHash: 'current-source',
  shard,
  shards: 2,
  passed: true,
  durations: [{ spec, duration, tests: [{ title: ['suite', spec], duration: 1, attempts: 1 }] }],
});
const expected = {
  kind: 'e2e',
  browser: 'chrome',
  shards: 2,
  sourceHash: 'current-source',
} as const;

describe('observed timing refresh', () => {
  it('merges every measured spec with per-test observations and provenance', () => {
    const result = mergeTimingObservations(
      [observation(2, 'b', 20), observation(1, 'a', 10)],
      ['a', 'b'],
      expected,
    );
    expect(result.durations.map(({ spec, duration }) => [spec, duration])).toEqual([
      ['a', 10],
      ['b', 20],
    ]);
    expect(result.durations[0].tests?.[0]).toEqual({
      title: ['suite', 'a'],
      duration: 1,
      attempts: 1,
    });
    expect(result.provenance).toMatchObject({ revision: 'abc', browser: 'chrome', shards: 2 });
  });

  it.each([
    ['failed shard', { passed: false }],
    ['wrong schema', { schemaVersion: 2 }],
    ['wrong browser', { browser: 'firefox' }],
    ['wrong kind', { kind: 'component' }],
    ['mixed revisions', { revision: 'def' }],
    ['mixed runs', { runId: '456' }],
    ['mixed attempts', { runAttempt: '2' }],
    ['outdated source tree', { sourceHash: 'old-source' }],
    ['wrong shard count', { shards: 3 }],
    ['duplicate shard', { shard: 1 }],
    ['out-of-range shard', { shard: 3 }],
    ['fractional shard', { shard: 1.5 }],
  ])('rejects %s', (_, changes) => {
    expect(() =>
      mergeTimingObservations(
        [observation(1, 'a', 10), { ...observation(2, 'b', 20), ...changes } as TimingObservation],
        ['a', 'b'],
        expected,
      ),
    ).toThrow();
  });

  it.each([
    ['missing shard', [observation(1, 'a', 10)]],
    ['missing spec', [observation(1, 'a', 10), { ...observation(2, 'b', 20), durations: [] }]],
    ['duplicate spec', [observation(1, 'a', 10), observation(2, 'a', 20)]],
    ['stale spec', [observation(1, 'a', 10), observation(2, 'deleted', 20)]],
    ['zero duration', [observation(1, 'a', 0), observation(2, 'b', 20)]],
    ['non-finite duration', [observation(1, 'a', NaN), observation(2, 'b', 20)]],
    ['missing provenance', [{ ...observation(1, 'a', 10), revision: '' }, observation(2, 'b', 20)]],
  ])('rejects %s without filling gaps from the old baseline', (_, observations) => {
    expect(() => mergeTimingObservations(observations, ['a', 'b'], expected)).toThrow();
  });

  it.each([
    undefined,
    [],
    [{ title: [], duration: 1, attempts: 1 }],
    [{ title: ['test'], duration: -1, attempts: 1 }],
    [{ title: ['test'], duration: 1, attempts: 0 }],
    [
      { title: ['same'], duration: 1, attempts: 1 },
      { title: ['same'], duration: 2, attempts: 1 },
    ],
  ])('rejects incomplete or ambiguous per-test measurements %#', (tests) => {
    const first = observation(1, 'a', 10);
    first.durations[0].tests = tests;
    expect(() =>
      mergeTimingObservations([first, observation(2, 'b', 20)], ['a', 'b'], expected),
    ).toThrow();
  });
});

describe('actual cypress-split scheduler', () => {
  it('assigns every spec once and balances longest-first', () => {
    const result = timingBalance(
      [8, 7, 6, 5, 4].map((duration, index) => ({ spec: `spec-${index}`, duration })),
      3,
    );
    expect(result.shards.map(({ duration }) => duration)).toEqual([8, 11, 11]);
    expect(result.shards.flatMap(({ specs }) => specs).sort()).toEqual(
      [0, 1, 2, 3, 4].map((index) => `spec-${index}`),
    );
    expect(result.lowerBound).toBe(10);
    expect(result.overheadAboveLowerBound).toBeCloseTo(0.1);
  });

  it('accounts for an indivisible slow spec', () => {
    const result = timingBalance(
      [100, 5, 4, 3].map((duration, index) => ({ spec: `${index}`, duration })),
      2,
    );
    expect(result.lowerBound).toBe(100);
    expect(result.overheadAboveLowerBound).toBe(0);
  });
});
