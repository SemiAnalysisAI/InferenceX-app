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
import {
  trendsCacheKey,
  isCompactionCandidate,
  dailyModelRollup,
  dailyModelLive,
  dailyCompactionRate,
  dailyCliVersionMix,
  dailyLatencyTrend,
  COMPACTION_IDLE_GAP_MS,
  COMPACTION_MIN_PREV_CACHE_READ,
  COMPACTION_CLIFF_DROP_RATIO,
  COMPACTION_WINDOW_DAYS,
  sanitizeTrendsPayload,
  type CompactionCandidateInputs,
  type TrendsPayload,
} from '@semianalysisai/inferencex-db/proxytrace/trends';

const row = (model: string, n: number) => ({
  day: 'd1',
  model,
  request_count: n,
  input_tokens: n,
  output_tokens: n,
  cache_read_input_tokens: n,
  cache_write_tokens: n,
});

describe('sanitizeTrendsPayload', () => {
  it('relabels unlisted models other and sums rows that collapse onto one day', () => {
    const payload = {
      dailyModel: [row('claude-opus-4-8', 1), row('hidden-a', 2), row('hidden-b', 3)],
    } as unknown as TrendsPayload;
    expect(sanitizeTrendsPayload(payload).dailyModel).toEqual([
      row('claude-opus-4-8', 1),
      row('other', 5),
    ]);
  });
});

// ── trendsCacheKey ───────────────────────────────────────────────────────

describe('trendsCacheKey', () => {
  it('collapses visibility to scope: null=all, empty/array=anon', () => {
    expect(trendsCacheKey(null, null)).toBe('tr:2:trends:all:all');
    expect(trendsCacheKey([], null)).toBe('tr:2:trends:anon:all');
    expect(trendsCacheKey(['client-1'], null)).toBe('tr:2:trends:anon:all');
  });

  it('encodes trace version (null => "all", number as-is)', () => {
    expect(trendsCacheKey(null, 7)).toBe('tr:2:trends:all:7');
    expect(trendsCacheKey([], 7)).toBe('tr:2:trends:anon:7');
    expect(trendsCacheKey([], 3)).toBe('tr:2:trends:anon:3');
  });

  it('lives in a disjoint namespace from stats.ts cache keys ("tr:" vs "sc:")', () => {
    expect(trendsCacheKey(null, null).startsWith('tr:')).toBe(true);
  });

  it('yields the 4 warmed scope x version combos uniquely', () => {
    const combos = new Set<string>();
    for (const vis of [null, []] as (string[] | null)[])
      for (const v of [null, 7]) combos.add(trendsCacheKey(vis, v));
    expect(combos.size).toBe(4);
  });
});

// ── isCompactionCandidate ────────────────────────────────────────────────

function baseInputs(overrides: Partial<CompactionCandidateInputs> = {}): CompactionCandidateInputs {
  return {
    prevCacheRead: 10_000,
    prevTotalContext: 12_000,
    curCacheRead: 500, // <= 20% of prevCacheRead (cliff)
    curTotalContext: 1_000, // shrinks vs prevTotalContext
    gapMs: 60_000, // 1 minute, well under idle threshold
    ...overrides,
  };
}

describe('isCompactionCandidate', () => {
  it('flags a genuine cliff: big drop in cache_read + total context shrink, no boundary/gap', () => {
    expect(isCompactionCandidate(baseInputs())).toBe(true);
  });

  it('rejects session boundaries (prevCacheRead null)', () => {
    expect(isCompactionCandidate(baseInputs({ prevCacheRead: null }))).toBe(false);
  });

  it('rejects session boundaries (prevTotalContext null)', () => {
    expect(isCompactionCandidate(baseInputs({ prevTotalContext: null }))).toBe(false);
  });

  it('rejects session boundaries (gapMs null)', () => {
    expect(isCompactionCandidate(baseInputs({ gapMs: null }))).toBe(false);
  });

  it('rejects when current cache_read is null', () => {
    expect(isCompactionCandidate(baseInputs({ curCacheRead: null }))).toBe(false);
  });

  it('rejects idle-gap restarts (gap >= 30 min)', () => {
    expect(isCompactionCandidate(baseInputs({ gapMs: COMPACTION_IDLE_GAP_MS }))).toBe(false);
    expect(isCompactionCandidate(baseInputs({ gapMs: COMPACTION_IDLE_GAP_MS + 1 }))).toBe(false);
    // just under the threshold still counts
    expect(isCompactionCandidate(baseInputs({ gapMs: COMPACTION_IDLE_GAP_MS - 1 }))).toBe(true);
  });

  it('rejects a too-small prior context (< 1,000 cache-read tokens)', () => {
    expect(
      isCompactionCandidate(
        baseInputs({ prevCacheRead: COMPACTION_MIN_PREV_CACHE_READ - 1, curCacheRead: 1 }),
      ),
    ).toBe(false);
    // exactly at the threshold is allowed
    expect(
      isCompactionCandidate(
        baseInputs({
          prevCacheRead: COMPACTION_MIN_PREV_CACHE_READ,
          curCacheRead: 1,
          prevTotalContext: COMPACTION_MIN_PREV_CACHE_READ + 500,
          curTotalContext: 1,
        }),
      ),
    ).toBe(true);
  });

  it('rejects a shallow drop (current cache_read above the cliff ratio)', () => {
    // 80% cliff means current must be <= 20% of previous; 50% of previous is not a cliff.
    expect(isCompactionCandidate(baseInputs({ prevCacheRead: 10_000, curCacheRead: 5_000 }))).toBe(
      false,
    );
    // exactly at the ratio boundary is allowed
    const boundary = 10_000 * (1 - COMPACTION_CLIFF_DROP_RATIO);
    expect(
      isCompactionCandidate(baseInputs({ prevCacheRead: 10_000, curCacheRead: boundary })),
    ).toBe(true);
  });

  it('rejects when total context does not shrink (cache-write-only turn, not a compaction)', () => {
    expect(
      isCompactionCandidate(
        baseInputs({ prevTotalContext: 1_000, curTotalContext: 1_000, curCacheRead: 1 }),
      ),
    ).toBe(false);
    expect(
      isCompactionCandidate(
        baseInputs({ prevTotalContext: 1_000, curTotalContext: 1_500, curCacheRead: 1 }),
      ),
    ).toBe(false);
  });
});

// ── SQL shape (capturingDb pattern, mirrors stats-cache.test.ts) ────────

const noop = () => Promise.resolve();

function capturingDb(sink: CompiledQuery[]): Kysely<Database> {
  const connection: DatabaseConnection = {
    executeQuery: <R>(cq: CompiledQuery): Promise<QueryResult<R>> => {
      sink.push(cq);
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

describe('dailyModelRollup SQL shape', () => {
  it('merges a rollup-table historical scan with a live "today" tail', async () => {
    const sink: CompiledQuery[] = [];
    await dailyModelRollup(capturingDb(sink), null, null);
    expect(sink).toHaveLength(2);

    const rollupSql = sink[0].sql.toLowerCase();
    expect(rollupSql).toContain('from rollup_requests_daily');
    expect(rollupSql).toMatch(/day < \(\$\d+::timestamptz at time zone 'utc'\)::date/u);
    expect(rollupSql).toContain('group by day, model');
    expect(rollupSql).toContain("day::timestamp at time zone 'utc' as day");

    const liveSql = sink[1].sql.toLowerCase();
    expect(liveSql).toContain('from requests');
    // UTC-hardened: explicit AT TIME ZONE 'UTC' rather than relying on the
    // session TimeZone being UTC (P2-c).
    const utcLiveBucket = "date_trunc('day', requests.timestamp at time zone 'utc')";
    expect(liveSql.split(utcLiveBucket)).toHaveLength(3);
    expect(liveSql).toContain('requests.timestamp >=');
  });

  it('applies an admin (all-visibility) filter as TRUE on the rollup query when vis is null', async () => {
    const sink: CompiledQuery[] = [];
    await dailyModelRollup(capturingDb(sink), null, null);
    expect(sink[0].sql.toLowerCase()).toContain('true');
  });

  it('applies an anon-only filter on the rollup query when vis is non-null', async () => {
    const sink: CompiledQuery[] = [];
    await dailyModelRollup(capturingDb(sink), [], null);
    expect(sink[0].sql.toLowerCase()).toContain("rollup_requests_daily.privacy_mode = 'anon'");
  });

  it('pins trace_version on the rollup query when a version is given', async () => {
    const sink: CompiledQuery[] = [];
    await dailyModelRollup(capturingDb(sink), null, 7);
    expect(sink[0].sql.toLowerCase()).toContain('rollup_requests_daily.trace_version');
    expect(sink[0].parameters).toContain(7);
  });
});

describe('daily trends UTC day buckets', () => {
  const cases: {
    name: string;
    run: (db: Kysely<Database>) => Promise<unknown>;
    bucket: string;
    expectedOccurrences: number;
  }[] = [
    {
      name: 'live model fallback',
      run: (db) => dailyModelLive(db, null, null),
      bucket: "date_trunc('day', requests.timestamp at time zone 'utc')",
      expectedOccurrences: 2,
    },
    {
      name: 'compaction',
      run: (db) => dailyCompactionRate(db, null, null),
      bucket: "date_trunc('day', timestamp at time zone 'utc')::date",
      expectedOccurrences: 1,
    },
    {
      name: 'CLI version',
      run: (db) => dailyCliVersionMix(db, null, null),
      bucket: "date_trunc('day', sessions.started_at at time zone 'utc')::date",
      expectedOccurrences: 2,
    },
    {
      name: 'latency',
      run: (db) => dailyLatencyTrend(db, null, null),
      bucket: "date_trunc('day', requests.timestamp at time zone 'utc')::date",
      expectedOccurrences: 1,
    },
  ];

  it.each(cases)('$name uses explicit UTC in every day-bucket expression', async (testCase) => {
    const sink: CompiledQuery[] = [];
    await testCase.run(capturingDb(sink));

    expect(sink).toHaveLength(1);
    expect(sink[0].sql.toLowerCase().split(testCase.bucket)).toHaveLength(
      testCase.expectedOccurrences + 1,
    );
  });
});

describe('dailyCompactionRate SQL shape', () => {
  it('uses a single LAG() pass partitioned by session, ordered by timestamp', async () => {
    const sink: CompiledQuery[] = [];
    await dailyCompactionRate(capturingDb(sink), null, null);
    expect(sink).toHaveLength(1);
    const sql = sink[0].sql.toLowerCase();
    expect(sql).toContain('lag(');
    expect(sql).toContain('partition by requests.session_id order by requests.timestamp');
    expect(sql).toContain('make_interval(days =>');
    expect(sql).toContain('filter (');
  });

  it('honors a custom windowDays override', async () => {
    const sink: CompiledQuery[] = [];
    await dailyCompactionRate(capturingDb(sink), null, null, 30);
    expect(sink[0].parameters).toContain(30);
    expect(sink[0].parameters).not.toContain(COMPACTION_WINDOW_DAYS);
  });

  it('parameterizes the same predicate constants as isCompactionCandidate (kept in sync)', async () => {
    const sink: CompiledQuery[] = [];
    await dailyCompactionRate(capturingDb(sink), null, null);
    const { parameters } = sink[0];
    expect(parameters).toContain(COMPACTION_IDLE_GAP_MS);
    expect(parameters).toContain(COMPACTION_MIN_PREV_CACHE_READ);
    expect(parameters).toContain(1 - COMPACTION_CLIFF_DROP_RATIO);
  });
});
