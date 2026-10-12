import { createRequire } from 'node:module';

export interface SpecTiming {
  spec: string;
  duration: number;
  tests?: { title: string[]; duration: number; attempts: number }[];
}

export interface TimingObservation {
  schemaVersion: 1;
  kind: 'e2e' | 'component';
  browser: string;
  revision: string;
  runId: string;
  runAttempt: string;
  shard: number;
  shards: number;
  passed: boolean;
  durations: SpecTiming[];
}

export function validateTimings(durations: SpecTiming[], specs: string[]): void {
  const actual = durations.map(({ spec }) => spec).sort();
  const expected = [...specs].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Timing inventory must contain every current spec exactly once');
  }
  for (const entry of durations) {
    if (!Number.isFinite(entry.duration) || entry.duration <= 0) {
      throw new Error(`Invalid duration: ${entry.spec}`);
    }
  }
}

export function mergeTimingObservations(
  observations: TimingObservation[],
  specs: string[],
  expected: Pick<TimingObservation, 'kind' | 'browser' | 'shards'>,
) {
  if (observations.length !== expected.shards) throw new Error('Incomplete shard set');
  const first = observations[0];
  if (!first?.revision || !first.runId || !first.runAttempt) {
    throw new Error('Missing timing provenance');
  }
  const seen = new Set<number>();
  for (const observation of observations) {
    if (
      observation.schemaVersion !== 1 ||
      !observation.passed ||
      observation.kind !== expected.kind ||
      observation.browser !== expected.browser ||
      observation.shards !== expected.shards ||
      observation.revision !== first.revision ||
      observation.runId !== first.runId ||
      observation.runAttempt !== first.runAttempt
    ) {
      throw new Error('Failed, incompatible, or mixed-run timing observations');
    }
    if (
      !Number.isInteger(observation.shard) ||
      observation.shard < 1 ||
      observation.shard > expected.shards ||
      seen.has(observation.shard)
    ) {
      throw new Error('Invalid or duplicate shard');
    }
    seen.add(observation.shard);
    for (const { spec, tests } of observation.durations) {
      if (!tests?.length) throw new Error(`Missing per-test observations: ${spec}`);
      const titles = new Set<string>();
      for (const test of tests) {
        const title = JSON.stringify(test.title);
        if (
          !test.title.length ||
          !test.title.every((part) => typeof part === 'string' && part.length > 0) ||
          titles.has(title) ||
          !Number.isFinite(test.duration) ||
          test.duration < 0 ||
          !Number.isInteger(test.attempts) ||
          test.attempts < 1
        ) {
          throw new Error(`Invalid or duplicate per-test observation: ${spec}`);
        }
        titles.add(title);
      }
    }
  }
  const durations = observations.flatMap((observation) => observation.durations);
  validateTimings(durations, specs);
  return {
    provenance: {
      revision: first.revision,
      runId: first.runId,
      runAttempt: first.runAttempt,
      browser: first.browser,
      kind: first.kind,
      shards: first.shards,
    },
    durations: durations.sort((a, b) => a.spec.localeCompare(b.spec)),
  };
}

// Use the installed scheduler, not a second implementation that can drift from CI.
const { splitByDuration } = createRequire(import.meta.url)('cypress-split/src/timings') as {
  splitByDuration: (
    shards: number,
    entries: { specName: string; duration: number }[],
  ) => { chunks: { specName: string; duration: number }[][]; sums: number[] };
};

export function timingBalance(durations: SpecTiming[], shards: number) {
  if (!Number.isInteger(shards) || shards < 1 || shards > durations.length) {
    throw new Error('Shard count must be between one and the number of specs');
  }
  validateTimings(
    durations,
    durations.map(({ spec }) => spec),
  );
  if (new Set(durations.map(({ spec }) => spec)).size !== durations.length) {
    throw new Error('Duplicate spec');
  }
  const { chunks, sums } = splitByDuration(
    shards,
    [...durations]
      .sort((a, b) => a.spec.localeCompare(b.spec))
      .map(({ spec, duration }) => ({ specName: spec, duration: Math.round(duration) })),
  );
  const total = sums.reduce((sum, duration) => sum + duration, 0);
  const lowerBound = Math.max(
    total / shards,
    ...durations.map(({ duration }) => Math.round(duration)),
  );
  return {
    shards: chunks.map((chunk, index) => ({
      shard: index + 1,
      duration: sums[index],
      specs: chunk.map(({ specName }) => specName),
    })),
    lowerBound,
    longest: Math.max(...sums),
    overheadAboveLowerBound: Math.max(...sums) / lowerBound - 1,
  };
}
