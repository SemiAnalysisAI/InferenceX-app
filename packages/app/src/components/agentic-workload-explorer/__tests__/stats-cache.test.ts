import { describe, it, expect, vi } from 'vitest';
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
import {
  getErrorReach,
  getPricingCoverage,
  getToolAnalytics,
} from '@semianalysisai/inferencex-db/proxytrace/operations';
import {
  assertRollupReady,
  statsCacheKey,
  percentileCont,
  percentiles5,
  isRollupNotReadyError,
  sessionInsightsHistogram,
  sessionInsightsPercentiles,
  type StatsCacheKind,
} from '@semianalysisai/inferencex-db/proxytrace/stats';
import { coalesceCompute } from '@/lib/agentic-workload-explorer/stats-cache';

describe('statsCacheKey', () => {
  it('collapses visibility to scope: null=all, empty/array=anon', () => {
    expect(statsCacheKey('overview', null, null)).toBe('sc:3:overview:all:all');
    expect(statsCacheKey('overview', [], null)).toBe('sc:3:overview:anon:all');
    expect(statsCacheKey('overview', ['client-1'], null)).toBe('sc:3:overview:anon:all');
  });

  it('encodes trace version (null => "all", number as-is)', () => {
    expect(statsCacheKey('models', null, 7)).toBe('sc:3:models:all:7');
    expect(statsCacheKey('models', [], 7)).toBe('sc:3:models:anon:7');
    expect(statsCacheKey('models', [], 3)).toBe('sc:3:models:anon:3');
  });

  it('distinguishes kind and yields the 8 warmed combos uniquely', () => {
    const combos = new Set<string>();
    for (const kind of ['overview', 'models'] as const)
      for (const vis of [null, []] as (string[] | null)[])
        for (const v of [null, 7]) combos.add(statsCacheKey(kind, vis, v));
    expect(combos.size).toBe(8);
    expect(statsCacheKey('overview', null, null)).not.toBe(statsCacheKey('models', null, null));
  });

  it('keeps performance and fast-mode keys stable and unique across scopes and versions', () => {
    const kinds = ['performance', 'fast-mode'] satisfies StatsCacheKind[];
    const keys = kinds.flatMap((kind) => [
      statsCacheKey(kind, null, null),
      statsCacheKey(kind, [], null),
      statsCacheKey(kind, null, 7),
      statsCacheKey(kind, ['client-1'], 7),
    ]);

    expect(keys).toEqual([
      'sc:1:performance:all:all',
      'sc:1:performance:anon:all',
      'sc:1:performance:all:7',
      'sc:1:performance:anon:7',
      'sc:1:fast-mode:all:all',
      'sc:1:fast-mode:anon:all',
      'sc:1:fast-mode:all:7',
      'sc:1:fast-mode:anon:7',
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('invalidates rollup-backed keys without invalidating Wave-2A payloads', () => {
    const wave2AKinds = [
      'cache',
      'traffic',
      'web-search',
      'platform',
      'session-insights',
      'performance',
      'fast-mode',
    ] satisfies StatsCacheKind[];

    expect(statsCacheKey('overview', null, null)).toBe('sc:3:overview:all:all');
    expect(statsCacheKey('models', [], 7)).toBe('sc:3:models:anon:7');
    expect(statsCacheKey('costs', null, null)).toBe('sc:2:costs:all:all');
    expect(statsCacheKey('costs', [], 7)).toBe('sc:2:costs:anon:7');
    expect(statsCacheKey('errors', null, null)).toBe('sc:2:errors:all:all');
    expect(statsCacheKey('errors', [], 7)).toBe('sc:2:errors:anon:7');
    expect(statsCacheKey('graphs', null, null)).toBe('sc:4:graphs:all:all');
    expect(statsCacheKey('graphs', [], 7)).toBe('sc:4:graphs:anon:7');
    for (const kind of wave2AKinds) {
      expect(statsCacheKey(kind, null, null)).toBe(`sc:1:${kind}:all:all`);
      expect(statsCacheKey(kind, [], 7)).toBe(`sc:1:${kind}:anon:7`);
    }
  });
});

describe('sessionInsightsHistogram / sessionInsightsPercentiles (route port)', () => {
  it('empty input yields no bins and zeroed percentiles', () => {
    const { bins, percentiles } = sessionInsightsHistogram([], 30);
    expect(bins).toEqual([]);
    expect(percentiles).toEqual({ p25: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 });
  });

  it('single distinct value collapses to one [v, v+1) bin', () => {
    const { bins } = sessionInsightsHistogram([5, 5, 5], 30);
    expect(bins).toEqual([{ min: 5, max: 6, count: 3 }]);
  });

  it('builds exactly bucketCount equal-width bins and clips beyond p95+10%', () => {
    // 100 values 1..100; p95 (nearest-rank) index = floor(0.95*100)=95 -> value 96.
    // max = 96 + (96-1)*0.1 = 105.5, so nothing is clipped here; all 100 counted.
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const { bins } = sessionInsightsHistogram(values, 20);
    expect(bins).toHaveLength(20);
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(100);
    expect(bins[0].min).toBe(1);
  });

  it('clips extreme outliers above the p95+10% ceiling', () => {
    // 100 values 1..100 plus 5 huge outliers. n=105, p95 index=floor(0.95*105)=99
    // -> value 100; ceiling = 100 + (100-1)*0.1 = 109.9. The 5 outliers exceed it
    // and are dropped, so the bins count only the 100 in-range values.
    const values = [
      ...Array.from({ length: 100 }, (_, i) => i + 1),
      10000,
      10000,
      10000,
      10000,
      10000,
    ];
    const { bins } = sessionInsightsHistogram(values, 10);
    expect(bins).toHaveLength(10);
    const total = bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(100);
  });

  it('percentiles use nearest-rank (matches the old route pct())', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const p = sessionInsightsPercentiles(sorted);
    // pct(p) = sorted[min(floor(p/100 * 100), 99)]
    expect(p.p25).toBe(26); // sorted[25]
    expect(p.p50).toBe(51); // sorted[50]
    expect(p.p99).toBe(100); // sorted[min(99,99)]
    expect(Object.keys(p)).toEqual(['p25', 'p50', 'p75', 'p90', 'p95', 'p99']);
  });
});

describe('percentileCont (matches Postgres percentile_cont interpolation)', () => {
  it('interpolates linearly between ranks', () => {
    // Reference values from Postgres percentile_cont over {1,2,3,4}.
    const v = [1, 2, 3, 4];
    expect(percentileCont(v, 0)).toBe(1);
    expect(percentileCont(v, 0.5)).toBeCloseTo(2.5, 12); // (n-1)*p = 1.5 -> 2 + 0.5*(3-2)
    expect(percentileCont(v, 1)).toBe(4);
    expect(percentileCont(v, 0.25)).toBeCloseTo(1.75, 12);
  });

  it('handles empty (0) and single-element inputs', () => {
    expect(percentileCont([], 0.5)).toBe(0);
    expect(percentileCont([42], 0.9)).toBe(42);
  });

  it('percentiles5 returns the five overview percentiles', () => {
    const counts = [5, 1, 3, 2, 4]; // unsorted input is sorted internally
    const p = percentiles5(counts);
    expect(p.p50).toBeCloseTo(3, 12);
    expect(p.p25).toBeCloseTo(2, 12);
    expect(p.p75).toBeCloseTo(4, 12);
    expect(Object.keys(p)).toEqual(['p25', 'p50', 'p75', 'p90', 'p99']);
  });
});

const noop = () => Promise.resolve();

// A Kysely instance that captures compiled SQL instead of hitting a DB — lets
// us assert the rollup upsert shape + watermark math with no network.
function capturingDb(
  sink: CompiledQuery[],
  rowSets: readonly (readonly unknown[])[] = [],
): Kysely<Database> {
  const connection: DatabaseConnection = {
    executeQuery: <R>(cq: CompiledQuery): Promise<QueryResult<R>> => {
      const queryIndex = sink.length;
      sink.push(cq);
      // Test fixtures are paired with query order at this generic Kysely driver boundary.
      const rows = (rowSets[queryIndex] ?? []) as unknown as R[];
      return Promise.resolve({ rows });
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

describe('getPricingCoverage', () => {
  it('excludes zero-usage requests and summarizes unpriced model exposure', async () => {
    const sink: CompiledQuery[] = [];
    const db = capturingDb(sink, [
      [
        {
          model: 'priced-model',
          usage_request_count: 10,
          unpriced_request_count: 0,
          input_tokens: 1000,
          unpriced_input_tokens: 0,
          output_tokens: 400,
          unpriced_output_tokens: 0,
          cache_read_input_tokens: 3000,
          unpriced_cache_read_input_tokens: 0,
          cache_write_tokens: 500,
          unpriced_cache_write_tokens: 0,
        },
        {
          model: 'new-unpriced-model',
          usage_request_count: 2,
          unpriced_request_count: 2,
          input_tokens: 100,
          unpriced_input_tokens: 100,
          output_tokens: 80,
          unpriced_output_tokens: 80,
          cache_read_input_tokens: 200,
          unpriced_cache_read_input_tokens: 200,
          cache_write_tokens: 50,
          unpriced_cache_write_tokens: 50,
        },
      ],
    ]);

    const coverage = await getPricingCoverage([], null, db);

    expect(coverage).toMatchObject({
      window_days: 7,
      usage_request_count: 12,
      priced_request_count: 10,
      unpriced_request_count: 2,
      request_coverage: 10 / 12,
      input_side_tokens: 4850,
      priced_input_side_tokens: 4500,
      input_side_token_coverage: 4500 / 4850,
      output_tokens: 480,
      priced_output_tokens: 400,
      output_token_coverage: 400 / 480,
    });
    expect(coverage.by_model).toEqual([
      {
        model: 'new-unpriced-model',
        request_count: 2,
        input_tokens: 100,
        output_tokens: 80,
        cache_read_input_tokens: 200,
        cache_write_tokens: 50,
      },
    ]);
    expect(sink).toHaveLength(1);
    expect(sink[0].sql.toLowerCase()).toContain('cost_usd is not null as is_priced');
    expect(sink[0].sql.toLowerCase()).toMatch(
      /\$\d+::timestamptz - make_interval\(days => \$\d+\)/u,
    );
    expect(sink[0].parameters).toContain('2026-09-26T08:07:23Z');
    expect(sink[0].parameters).toContain(7);
  });
});

describe('getErrorReach', () => {
  it('separates affected-session reach from repeated-error concentration', async () => {
    const sink: CompiledQuery[] = [];
    const db = capturingDb(sink, [
      [
        {
          client: '(all)',
          request_count: 1000,
          error_count: 10,
          session_count: 100,
          affected_session_count: 5,
          repeat_error_session_count: 2,
          repeat_error_count: 7,
          avg_errors_per_affected_session: 2,
          p50_errors_per_affected_session: 1,
          p90_errors_per_affected_session: 4,
          max_errors_in_session: 5,
          top_session_error_count: 5,
          top_ten_error_count: 10,
        },
        {
          client: 'anthropic',
          request_count: 800,
          error_count: 4,
          session_count: 80,
          affected_session_count: 4,
          repeat_error_session_count: 0,
          repeat_error_count: 0,
          avg_errors_per_affected_session: 1,
          p50_errors_per_affected_session: 1,
          p90_errors_per_affected_session: 1,
          max_errors_in_session: 1,
          top_session_error_count: 1,
          top_ten_error_count: 4,
        },
      ],
    ]);

    const reach = await getErrorReach([], null, db);

    expect(reach.window_days).toBe(30);
    expect(reach.overall).toMatchObject({
      request_count: 1000,
      error_count: 10,
      request_error_rate: 0.01,
      session_count: 100,
      affected_session_count: 5,
      affected_session_rate: 0.05,
      repeat_error_session_count: 2,
      repeat_error_count: 7,
      repeat_error_share: 0.7,
      top_session_error_share: 0.5,
      top_ten_error_share: 1,
    });
    expect(reach.by_client).toHaveLength(1);
    expect(reach.by_client[0]).toMatchObject({
      client: 'anthropic',
      request_error_rate: 0.005,
      affected_session_rate: 0.05,
      repeat_error_share: 0,
    });
    expect(sink).toHaveLength(1);
    expect(sink[0].sql.toLowerCase()).toContain('row_number() over');
    expect(sink[0].sql.toLowerCase()).toContain('error_rank <= 10');
    expect(sink[0].sql.toLowerCase()).toMatch(
      /\$\d+::timestamptz - make_interval\(days => \$\d+\)/u,
    );
    expect(sink[0].parameters).toContain('2026-09-26T08:07:23Z');
    expect(sink[0].parameters).toContain(30);
  });
});

describe('getToolAnalytics OS attribution SQL', () => {
  it('falls back to user-agent OS only when explicit OS metadata is absent', async () => {
    const sink: CompiledQuery[] = [];
    const db = capturingDb(sink, [
      [
        {
          tool_counts: [],
          transitions: [],
          session_tool_stats: [],
          tool_error_rates: [],
          tool_error_rates_by_os: [],
          verification_summary: null,
          verification_by_kind: [],
          session_outcome_counts: [],
        },
      ],
    ]);

    await getToolAnalytics([], db, null);

    expect(sink).toHaveLength(1);
    const normalizedSql = sink[0].sql.toLowerCase().replaceAll(/\s+/gu, ' ');
    expect(normalizedSql).toContain(
      "case when lower(nullif(trim(s.metadata ->> 'os'), '')) is not null then case",
    );
    expect(normalizedSql).not.toContain('coalesce( case when');
  });
});

describe('assertRollupReady', () => {
  it('short-circuits historical coverage work when the readiness marker exists', async () => {
    const sink: CompiledQuery[] = [];
    const db = capturingDb(sink, [[{ key: 'rollup:1:full-history' }]]);

    await expect(assertRollupReady(db)).resolves.toBeUndefined();

    expect(sink).toHaveLength(1);
    expect(sink[0].parameters).toContain('rollup:1:full-history');
  });

  it('rejects when historical request and rollup counts differ', async () => {
    const sink: CompiledQuery[] = [];
    const db = capturingDb(sink, [[], [{ request_count: '12', rollup_count: '11' }]]);

    let caught: unknown;
    try {
      await assertRollupReady(db);
    } catch (error) {
      caught = error;
    }

    expect(isRollupNotReadyError(caught)).toBe(true);
    expect(sink).toHaveLength(2);
  });
});

describe('coalesceCompute (P1-b cold-miss stampede fix)', () => {
  it('coalesces concurrent calls sharing the same key into one compute', async () => {
    let calls = 0;
    let resolve!: (v: number) => void;
    const compute = () =>
      new Promise<number>((res) => {
        calls++;
        resolve = res;
      });

    const p1 = coalesceCompute('k1', compute);
    const p2 = coalesceCompute('k1', compute);
    // Second call reused the first's in-flight promise instead of invoking
    // compute again — this is the fix: parallel cold-miss requests for the
    // same cache key share one compute rather than each running it inline.
    expect(calls).toBe(1);
    expect(p1).toBe(p2);

    resolve(42);
    await expect(p1).resolves.toBe(42);
    await expect(p2).resolves.toBe(42);
  });

  it('does not coalesce calls with different keys', async () => {
    const compute = vi.fn(() => Promise.resolve('value'));
    await Promise.all([coalesceCompute('a', compute), coalesceCompute('b', compute)]);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight entry once settled, so a later call recomputes', async () => {
    const first = vi.fn(() => Promise.resolve('first'));
    await expect(coalesceCompute('k2', first)).resolves.toBe('first');
    expect(first).toHaveBeenCalledTimes(1);

    // The first call has already settled (and been removed from the map) by
    // the time this second call starts, so it must run its OWN compute.
    const second = vi.fn(() => Promise.resolve('second'));
    await expect(coalesceCompute('k2', second)).resolves.toBe('second');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight entry on rejection too, so a retry is possible', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(coalesceCompute('k3', failing)).rejects.toThrow('boom');

    const succeeding = vi.fn(() => Promise.resolve('recovered'));
    await expect(coalesceCompute('k3', succeeding)).resolves.toBe('recovered');
    expect(succeeding).toHaveBeenCalledTimes(1);
  });
});
