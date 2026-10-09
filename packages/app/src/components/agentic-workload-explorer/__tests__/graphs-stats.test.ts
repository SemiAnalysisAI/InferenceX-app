import { describe, it, expect } from 'vitest';
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import type { Database } from '@semianalysisai/inferencex-db/proxytrace/types';
import { getSubagentStatsPerSessionDistribution } from '@semianalysisai/inferencex-db/proxytrace/operations';
import {
  computeGraphsPayload,
  graphBuildHistogram,
  graphPercentiles,
  graphConcurrencyBuckets,
  GRAPH_DATASET_KEYS,
  statsCacheKey,
} from '@semianalysisai/inferencex-db/proxytrace/stats';

// ─────────────────────────────────────────────────────────────────────────
// Parity fixtures: inline copies of the ORIGINAL client-side math that lived in
// packages/app/src/app/(dashboard)/graphs/page.tsx before the server-side binning
// rewrite. The server ports (graph*) must be byte-for-byte equal to these.
// ─────────────────────────────────────────────────────────────────────────

interface Bucket {
  min: number;
  max: number;
  count: number;
}

// Original `buildHistogram(values, bucketCount)` — verbatim.
function originalBuildHistogram(values: number[], bucketCount: number): Bucket[] {
  if (values.length === 0) return [];
  const sorted = [...values].toSorted((a, b) => a - b);
  if (sorted[0] === sorted.at(-1)) {
    return [{ min: sorted[0], max: sorted[0], count: values.length }];
  }
  const min = sorted[0];
  const p95Idx = Math.min(Math.floor(0.95 * sorted.length), sorted.length - 1);
  const p95Val = sorted[p95Idx];
  const max = p95Val + (p95Val - min) * 0.1 || sorted.at(-1)!;
  const step = (max - min) / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    min: min + i * step,
    max: min + (i + 1) * step,
    count: 0,
  }));
  for (const v of sorted) {
    if (v > max) continue;
    let idx = Math.floor((v - min) / step);
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx].count++;
  }
  return buckets;
}

// Original Histogram percentile block — verbatim.
function originalPercentiles(
  values: number[],
  tailDirection: 'high' | 'low',
  sourceValues?: number[],
  sourceTransform?: (v: number) => number,
): { label: string; value: number }[] {
  const sorted = [...values].toSorted((a, b) => a - b);
  const src = sourceValues ? [...sourceValues].toSorted((a, b) => a - b) : sorted;
  const pct = (p: number) => src[Math.min(Math.floor((p / 100) * src.length), src.length - 1)];
  const transform = sourceTransform || ((v: number) => v);
  const ps = tailDirection === 'low' ? [1, 5, 10, 25, 50] : [50, 75, 90, 95, 99];
  return ps.map((p) => ({ label: `p${p}`, value: transform(pct(p)) }));
}

// Original bucketConcurrencyCounts — verbatim (minus the client-only color).
const ORIGINAL_CONCURRENCY_DEFS: { label: string; accepts: (v: number) => boolean }[] = [
  { label: '0', accepts: (v) => v === 0 },
  { label: '1', accepts: (v) => v === 1 },
  { label: '2', accepts: (v) => v === 2 },
  { label: '3', accepts: (v) => v === 3 },
  { label: '4–5', accepts: (v) => v >= 4 && v <= 5 },
  { label: '6–10', accepts: (v) => v >= 6 && v <= 10 },
  { label: '11+', accepts: (v) => v >= 11 },
];
function originalConcurrency(values: number[]): { label: string; value: number }[] {
  const counts = ORIGINAL_CONCURRENCY_DEFS.map(() => 0);
  for (const v of values) {
    for (let i = 0; i < ORIGINAL_CONCURRENCY_DEFS.length; i++) {
      if (ORIGINAL_CONCURRENCY_DEFS[i].accepts(v)) {
        counts[i]++;
        break;
      }
    }
  }
  return ORIGINAL_CONCURRENCY_DEFS.map((def, i) => ({ label: def.label, value: counts[i] }));
}

// Deterministic pseudo-random in [0, 1) so the adversarial fixtures are stable
// across runs (exact values don't matter — the port is compared to the original
// over the SAME array).
function pseudoRandom(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const ADVERSARIAL: { name: string; values: number[] }[] = [
  { name: 'empty', values: [] },
  { name: 'single value repeated', values: [5, 5, 5, 5] },
  { name: 'single element', values: [42] },
  { name: 'two distinct', values: [1, 100] },
  { name: 'all-zero', values: [0, 0, 0, 0, 0] },
  { name: 'ascending 1..100', values: Array.from({ length: 100 }, (_, i) => i + 1) },
  {
    name: 'heavy ties + skew',
    values: [
      ...Array.from({ length: 90 }, () => 3),
      ...Array.from({ length: 10 }, (_, i) => i * 50),
    ],
  },
  {
    name: 'huge outliers past ceiling',
    values: [...Array.from({ length: 200 }, (_, i) => i + 1), 1e9, 1e9, 5e9, 9e9],
  },
  { name: 'negatives + positives', values: [-50, -10, -1, 0, 1, 2, 3, 3, 3, 100, 250] },
  {
    name: 'floats',
    values: Array.from({ length: 137 }, (_, i) => Math.sin(i) * 100 + 0.123 * i),
  },
  {
    name: 'random skewed n=1000',
    values: Array.from({ length: 1000 }, (_, i) => Math.floor(pseudoRandom(i) ** 3 * 100000)),
  },
];

describe('graphBuildHistogram (verbatim port of client buildHistogram)', () => {
  for (const { name, values } of ADVERSARIAL) {
    it(`matches the original on: ${name}`, () => {
      expect(graphBuildHistogram(values, 50)).toEqual(originalBuildHistogram(values, 50));
    });
  }

  it('single distinct value collapses to one [v, v] bucket holding all values', () => {
    expect(graphBuildHistogram([7, 7, 7], 50)).toEqual([{ min: 7, max: 7, count: 3 }]);
  });

  it('empty input yields no buckets', () => {
    expect(graphBuildHistogram([], 50)).toEqual([]);
  });
});

describe('graphPercentiles (verbatim port of the client percentile block)', () => {
  for (const { name, values } of ADVERSARIAL) {
    if (values.length === 0) continue; // percentiles are never read when n===0
    it(`high-tail set matches original on: ${name}`, () => {
      expect(graphPercentiles(values, 'high')).toEqual(originalPercentiles(values, 'high'));
    });
    it(`low-tail set matches original on: ${name}`, () => {
      expect(graphPercentiles(values, 'low')).toEqual(originalPercentiles(values, 'low'));
    });
  }

  it('high-tail surfaces p50/p75/p90/p95/p99; low-tail surfaces p1/p5/p10/p25/p50', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(graphPercentiles(v, 'high').map((p) => p.label)).toEqual([
      'p50',
      'p75',
      'p90',
      'p95',
      'p99',
    ]);
    expect(graphPercentiles(v, 'low').map((p) => p.label)).toEqual([
      'p1',
      'p5',
      'p10',
      'p25',
      'p50',
    ]);
    // Nearest-rank: pct(50) = sorted[floor(0.5*100)] = sorted[50] = 51.
    expect(graphPercentiles(v, 'high')[0]).toEqual({ label: 'p50', value: 51 });
  });
});

describe('interactivity source/transform behavior', () => {
  // TPOT (ms) → interactivity (tok/s): histogram uses 1000/tpot clipped to <=200,
  // but percentiles come from ALL positive TPOT, transformed via 1000/v, low tail.
  const tpot = [0, 2, 4, 5, 8, 10, 12, 16, 20, 40, 100, 500, 1000, 4000];
  const positiveTpot = tpot.filter((v) => v > 0);
  const interactivityValues = positiveTpot.map((v) => 1000 / v).filter((v) => v <= 200);

  it('histogram buckets use the clipped interactivity values', () => {
    expect(graphBuildHistogram(interactivityValues, 50)).toEqual(
      originalBuildHistogram(interactivityValues, 50),
    );
  });

  it('percentiles come from all positive TPOT, transformed (low tail)', () => {
    const ported = graphPercentiles(interactivityValues, 'low', positiveTpot, (v) => 1000 / v);
    const original = originalPercentiles(interactivityValues, 'low', positiveTpot, (v) => 1000 / v);
    expect(ported).toEqual(original);
    // Sanity: p1 of interactivity = 1000 / TPOT_p1 = 1000 / smallest positive TPOT.
    // pct(1) over positiveTpot (n=13) = sorted[floor(0.01*13)] = sorted[0] = 2 → 500.
    expect(ported[0]).toEqual({ label: 'p1', value: 500 });
  });
});

describe('graphConcurrencyBuckets (verbatim port of bucketConcurrencyCounts)', () => {
  const cases: number[][] = [
    [],
    [0, 0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 99],
    Array.from({ length: 50 }, (_, i) => i % 13),
    [4, 5, 6, 10, 11],
  ];
  for (const [i, values] of cases.entries()) {
    it(`matches the original bucketing (case ${i})`, () => {
      expect(graphConcurrencyBuckets(values)).toEqual(originalConcurrency(values));
    });
  }

  it('emits the 7 labeled buckets in order (en-dash labels intact)', () => {
    const out = graphConcurrencyBuckets([0, 1, 2, 3, 4, 5, 6, 10, 11]);
    expect(out.map((b) => b.label)).toEqual(['0', '1', '2', '3', '4–5', '6–10', '11+']);
    // 4 and 5 → '4–5'; 6 and 10 → '6–10'; 11 → '11+'.
    expect(out).toEqual([
      { label: '0', value: 1 },
      { label: '1', value: 1 },
      { label: '2', value: 1 },
      { label: '3', value: 1 },
      { label: '4–5', value: 2 },
      { label: '6–10', value: 2 },
      { label: '11+', value: 1 },
    ]);
  });
});

describe("statsCacheKey('graphs', ...) shape", () => {
  it('collapses scope + encodes trace version like the other kinds', () => {
    expect(statsCacheKey('graphs', null, null)).toBe('sc:4:graphs:all:all');
    expect(statsCacheKey('graphs', [], null)).toBe('sc:4:graphs:anon:all');
    expect(statsCacheKey('graphs', ['client-1'], 7)).toBe('sc:4:graphs:anon:7');
    expect(statsCacheKey('graphs', null, 8)).toBe('sc:4:graphs:all:8');
  });

  it('does not collide with the other cached kinds', () => {
    expect(statsCacheKey('graphs', null, null)).not.toBe(statsCacheKey('overview', null, null));
    expect(statsCacheKey('graphs', null, null)).not.toBe(
      statsCacheKey('session-insights', null, null),
    );
  });
});

// A Kysely instance whose connection always rejects — lets us prove whether a
// dataset's query was ever attempted, without needing a real per-key row
// shape for all 19 GraphDatasetKeys (which would require a live DB). If
// computeGraphsPayload resolves without touching this connection, no dataset
// query ran; if it queries at all, the returned promise rejects.
const noop = () => Promise.resolve();
function alwaysThrowsDb() {
  const err = new Error('unexpected query — dataset was not skipped');
  const connection: DatabaseConnection = {
    executeQuery: () => Promise.reject(err),
    // eslint-disable-next-line require-yield, require-await
    async *streamQuery() {
      throw err;
    },
  };
  const driver: Driver = {
    init: noop,
    acquireConnection: () => Promise.resolve(connection),
    beginTransaction: noop,
    commitTransaction: noop,
    rollbackTransaction: noop,
    releaseConnection: noop,
    destroy: noop,
  };
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

function capturingDb(queries: CompiledQuery[]): Kysely<Database> {
  const connection: DatabaseConnection = {
    executeQuery: <R>(query: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push(query);
      return Promise.resolve({ rows: [] });
    },
    // eslint-disable-next-line require-yield, require-await
    async *streamQuery() {
      throw new Error('not used');
    },
  };
  const driver: Driver = {
    init: noop,
    acquireConnection: () => Promise.resolve(connection),
    beginTransaction: noop,
    commitTransaction: noop,
    rollbackTransaction: noop,
    releaseConnection: noop,
    destroy: noop,
  };
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

function cteBody(sqlText: string, name: string, nextName: string): string {
  const startMarker = `${name} as (`;
  const endMarker = `), ${nextName} as (`;
  const start = sqlText.indexOf(startMarker);
  const end = sqlText.indexOf(endMarker, start + startMarker.length);
  if (start === -1 || end === -1) {
    throw new Error(`missing ${name} CTE before ${nextName}`);
  }
  return sqlText.slice(start + startMarker.length, end);
}

describe('computeGraphsPayload production-full computation diagnostics', () => {
  it('allows an explicit all-dataset diagnostic skip without opening a connection', async () => {
    const result = await computeGraphsPayload(alwaysThrowsDb(), null, null, {
      skipDatasets: GRAPH_DATASET_KEYS,
    });
    expect(result).toEqual({});
  });

  it('executes a dataset query when that dataset is left out of the diagnostic skip list', async () => {
    const skipAllButRequestStats = GRAPH_DATASET_KEYS.filter((k) => k !== 'requestStats');
    await expect(
      computeGraphsPayload(alwaysThrowsDb(), null, null, {
        skipDatasets: skipAllButRequestStats,
      }),
    ).rejects.toThrow('unexpected query — dataset was not skipped');
  });

  it('starts graph dataset computation when production supplies no diagnostic skips', async () => {
    await expect(computeGraphsPayload(alwaysThrowsDb(), null, null)).rejects.toThrow(
      'unexpected query — dataset was not skipped',
    );
  });
});

describe('getSubagentStatsPerSessionDistribution recent request window', () => {
  it('bounds both eligible-session and agent-run scans to the same parameterized seven days', async () => {
    const queries: CompiledQuery[] = [];
    const traceVersion = 17;
    const minReqs = 37;

    await expect(
      getSubagentStatsPerSessionDistribution(
        ['visible-client'],
        traceVersion,
        minReqs,
        capturingDb(queries),
      ),
    ).resolves.toEqual([]);

    expect(queries).toHaveLength(1);
    const query = queries[0];
    const normalizedSql = query.sql.replaceAll(/\s+/gu, ' ').trim().toLowerCase();
    const eligibleSessionsSql = cteBody(normalizedSql, 'eligible_sessions', 'agent_runs');
    const agentRunsSql = cteBody(normalizedSql, 'agent_runs', 'counts');

    expect(eligibleSessionsSql).toMatch(
      /from requests where requests\.privacy_mode = 'anon' and requests\.trace_version = \$\d+ and requests\.timestamp >= \$\d+::timestamptz - \(\$\d+ \|\| ' days'\)::interval/u,
    );
    expect(eligibleSessionsSql).toContain('having count(*) > $4');
    expect(agentRunsSql).toMatch(
      /from requests join eligible_sessions on eligible_sessions\.session_id = requests\.session_id where requests\.subagent_label is not null and requests\.privacy_mode = 'anon' and requests\.trace_version = \$\d+ and requests\.timestamp >= \$\d+::timestamptz - \(\$\d+ \|\| ' days'\)::interval/u,
    );
    const asOf = '2026-09-26T08:07:23Z';
    expect(query.parameters).toEqual([traceVersion, asOf, 7, minReqs, traceVersion, asOf, 7]);
  });
});
