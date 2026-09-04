import { describe, expect, it } from 'vitest';
import { verifyBackfillState, type BackfillState } from './agentic-backfill-integrity.js';

const before: BackfillState = {
  id: '439892',
  trace_id: '1162',
  benchmark_hash: 'benchmark',
  profile_hash: 'requests',
  server_hash: 'metrics',
  timeline_hash: 'timeline',
  chart_version: 15,
  stats_version: 8,
  timeline_version: 6,
  chart_counts: { kvCacheUsage: 200 },
  stats_present: { isl: true },
};
const versions = { chart: 20, stats: 10, timeline: 6 };
const after = { ...before, chart_version: 20, stats_version: 10 };

describe('verifyBackfillState', () => {
  it('accepts a derived-data upgrade without changing source data', () => {
    expect(() => verifyBackfillState(before, after, versions)).not.toThrow();
  });
  it.each(['benchmark_hash', 'profile_hash', 'server_hash', 'trace_id', 'timeline_hash'] as const)(
    'rejects a change to %s',
    (key) => {
      expect(() => verifyBackfillState(before, { ...after, [key]: 'changed' }, versions)).toThrow();
    },
  );
  it('rejects a nominally current but empty replacement chart', () => {
    expect(() => verifyBackfillState(before, { ...after, chart_counts: {} }, versions)).toThrow(
      'became empty',
    );
  });
  it('rejects lost aggregate data and incompatible versions', () => {
    expect(() => verifyBackfillState(before, { ...after, stats_present: {} }, versions)).toThrow(
      'became null',
    );
    expect(() => verifyBackfillState(before, { ...after, chart_version: 21 }, versions)).toThrow(
      'chart version',
    );
  });
  it('does not invent chart requirements for runs without captured server metrics', () => {
    const missing = { ...before, server_hash: null, chart_version: null, chart_counts: {} };
    expect(() =>
      verifyBackfillState(missing, { ...missing, stats_version: 10 }, versions),
    ).not.toThrow();
  });
});
