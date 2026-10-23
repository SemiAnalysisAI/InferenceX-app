import { describe, expect, it } from 'vitest';
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
  computeFastModePayload,
  computePerformanceLatencyPayload,
  computePerformancePayload,
  computePerformanceStreamingPayload,
  graphHistogram,
} from '@semianalysisai/inferencex-db/proxytrace/stats';

interface Bucket {
  min: number;
  max: number;
  count: number;
}

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
  for (const value of sorted) {
    if (value > max) continue;
    let index = Math.floor((value - min) / step);
    if (index >= bucketCount) index = bucketCount - 1;
    buckets[index].count++;
  }
  return buckets;
}

function originalPercentiles(
  values: number[],
  tailDirection: 'high' | 'low',
  sourceValues: number[] = values,
  sourceTransform: (value: number) => number = (value) => value,
): { label: string; value: number }[] {
  const sorted = [...sourceValues].toSorted((a, b) => a - b);
  const ranks = tailDirection === 'low' ? [1, 5, 10, 25, 50] : [50, 75, 90, 95, 99];
  return ranks.map((rank) => ({
    label: `p${rank}`,
    value: sourceTransform(
      sorted[Math.min(Math.floor((rank / 100) * sorted.length), sorted.length - 1)],
    ),
  }));
}

const transformInteractivity = (value: number) => 1_000 / value;
const normalize = (queries: CompiledQuery[]) =>
  queries.map((query) => query.sql.replaceAll(/\s+/gu, ' ').trim().toLowerCase());

const skewedLatency = [
  ...Array.from({ length: 96 }, (_, index) => (index % 8) * 7.5 + 1),
  750,
  2_500,
  1_000_000,
  9_000_000,
];
const tiedThroughput = [
  ...Array.from({ length: 87 }, () => 24.5),
  ...Array.from({ length: 10 }, (_, index) => index / 10),
  500,
  50_000,
];

const latencyMetricCases: {
  name: string;
  values: number[];
  tailDirection: 'high' | 'low';
}[] = [
  { name: 'E2E latency', values: skewedLatency, tailDirection: 'high' },
  {
    name: 'TTFT',
    values: [1, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 10_000],
    tailDirection: 'high',
  },
  {
    name: 'TPOT',
    values: [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 8_192],
    tailDirection: 'high',
  },
  { name: 'prefill speed', values: tiedThroughput, tailDirection: 'low' },
];

const streamingMetricCases: typeof latencyMetricCases = [
  { name: 'TTFT', values: latencyMetricCases[1].values, tailDirection: 'high' },
  { name: 'TPOT', values: latencyMetricCases[2].values, tailDirection: 'high' },
  { name: 'prefill speed', values: tiedThroughput, tailDirection: 'high' },
  {
    name: 'streaming latency',
    values: skewedLatency.toReversed().map((value) => value + 0.25),
    tailDirection: 'high',
  },
  {
    name: 'non-streaming latency',
    values: [3, 3, 3, 3, 4, 4, 5, 8, 13, 21, 34, 55, 89, 144, 233, 1e12],
    tailDirection: 'high',
  },
  { name: 'output throughput', values: tiedThroughput, tailDirection: 'high' },
];

describe('graphHistogram performance payload contract', () => {
  for (const { name, values, tailDirection } of latencyMetricCases) {
    it(`preserves 50-bin latency semantics for ${name}`, () => {
      expect(graphHistogram(values, tailDirection)).toEqual({
        buckets: originalBuildHistogram(values, 50),
        percentiles: originalPercentiles(values, tailDirection),
        n: values.length,
      });
    });
  }

  for (const { name, values, tailDirection } of streamingMetricCases) {
    it(`preserves 30-bin streaming semantics for ${name}`, () => {
      expect(graphHistogram(values, tailDirection, undefined, 30)).toEqual({
        buckets: originalBuildHistogram(values, 30),
        percentiles: originalPercentiles(values, tailDirection),
        n: values.length,
      });
    });
  }

  for (const bucketCount of [50, 30]) {
    const tailDirection = bucketCount === 50 ? 'low' : 'high';
    it(`uses clipped output-rate values for ${bucketCount}-bin interactivity buckets but all positive TPOT for percentiles`, () => {
      const tpot = [0, -1, 2, 4, 5, 8, 10, 12, 16, 20, 40, 100, 500, 1_000, 4_000];
      const positiveTpot = tpot.filter((value) => value > 0);
      const visibleInteractivity = positiveTpot
        .map((value) => 1_000 / value)
        .filter((value) => value <= 200);

      expect(
        graphHistogram(
          visibleInteractivity,
          tailDirection,
          { sourceValues: positiveTpot, sourceTransform: transformInteractivity },
          bucketCount,
        ),
      ).toEqual({
        buckets: originalBuildHistogram(visibleInteractivity, bucketCount),
        percentiles: originalPercentiles(
          visibleInteractivity,
          tailDirection,
          positiveTpot,
          transformInteractivity,
        ),
        n: visibleInteractivity.length,
      });
    });
  }

  it('returns the exact bounded empty shape instead of an empty raw distribution', () => {
    expect(graphHistogram([])).toEqual({ buckets: [], percentiles: [], n: 0 });
  });
});

const latencyFixture = [1, 2, 3, 4, 10_000];
const ttftFixture = [1, 2, 100, 1_000];
const tpotFixture = [2, 4, 5, 10, 1_000];
const prefillFixture = [10, 20, 300, 5_000];
const throughputFixture = [
  { is_streaming: true, duration_ms: 10, output_tokens: 1 },
  { is_streaming: true, duration_ms: 20, output_tokens: 4 },
  { is_streaming: false, duration_ms: 30, output_tokens: 3 },
  { is_streaming: true, duration_ms: 40, output_tokens: 0 },
  { is_streaming: false, duration_ms: 50, output_tokens: null },
  { is_streaming: true, duration_ms: 0, output_tokens: 50 },
];

const aggregateFixture = {
  p50: 51,
  p90: 900,
  p95: 950,
  p99: 990,
  avg: 250,
  count: 4,
  requests_today: 4,
  streaming_p50: 50,
  streaming_p95: 500,
  streaming_avg: 200,
  streaming_count: 2,
  non_streaming_p50: 75,
  non_streaming_p95: 750,
  non_streaming_avg: 300,
  non_streaming_count: 1,
  total_count: 3,
  streaming_avg_latency: 200,
  non_streaming_avg_latency: 300,
  hour: '2026-01-01T00:00:00.000Z',
  day: '2026-01-01',
  model: 'claude-sonnet-4-5-20250929',
  bucket: 1,
  read_bucket: 2,
  write_bucket: 3,
  output_bucket: 4,
  cache_total_bucket: 5,
  p90_tpot: 10,
};

const fastModeSummaryFixture = [
  {
    is_fast_mode: true,
    count: 7,
    total_cost: 12.5,
    avg_duration_ms: 420,
    avg_ttft_ms: 75,
    total_output_tokens: 9_000,
  },
  {
    is_fast_mode: false,
    count: 11,
    total_cost: 8.25,
    avg_duration_ms: 730,
    avg_ttft_ms: 140,
    total_output_tokens: 12_000,
  },
];
const fastModeDailyFixture = [
  {
    day: '2026-01-02',
    total_count: 18,
    fast_count: 7,
    total_cost: 20.75,
    fast_cost: 12.5,
  },
];
const fastModeByModelFixture = [
  {
    model: 'claude-sonnet-4-6',
    is_fast_mode: true,
    count: 7,
    total_cost: 12.5,
    avg_duration_ms: 420,
  },
];

const noOp = () => Promise.resolve();

interface QueryProbe {
  active: number;
  maxActive: number;
}

function fixtureDb(queries: CompiledQuery[], probe?: QueryProbe): Kysely<Database> {
  const connection: DatabaseConnection = {
    executeQuery: <R>(query: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push(query);
      if (probe) {
        probe.active++;
        probe.maxActive = Math.max(probe.maxActive, probe.active);
      }
      const sql = query.sql.replaceAll(/\s+/gu, ' ').trim().toLowerCase();
      let rows: readonly unknown[];
      if (sql.startsWith('select ttft_ms from requests')) {
        rows = ttftFixture.map((ttft_ms) => ({ ttft_ms }));
      } else if (sql.startsWith('select tpot_ms from requests')) {
        rows = tpotFixture.map((tpot_ms) => ({ tpot_ms }));
      } else if (sql.startsWith('select (coalesce(cache_read_input_tokens')) {
        rows = prefillFixture.map((prefill_speed) => ({ prefill_speed }));
      } else if (sql.includes('requests.is_streaming as is_streaming')) {
        rows = throughputFixture;
      } else if (sql.startsWith('select requests.duration_ms as duration_ms from requests')) {
        rows = latencyFixture.map((duration_ms) => ({ duration_ms }));
      } else if (sql.includes('total_output_tokens')) {
        rows = fastModeSummaryFixture;
      } else if (sql.startsWith("select date_trunc('day', timestamp)")) {
        rows = fastModeDailyFixture;
      } else if (sql.startsWith('select model, coalesce(is_fast_mode')) {
        rows = fastModeByModelFixture;
      } else {
        rows = [aggregateFixture];
      }
      const result = Promise.resolve({ rows: rows as R[] });
      if (!probe) return result;
      return result.finally(() => {
        probe.active--;
      });
    },
    // eslint-disable-next-line require-yield, require-await
    async *streamQuery() {
      throw new Error('not used');
    },
  };
  const driver: Driver = {
    init: noOp,
    acquireConnection: () => Promise.resolve(connection),
    beginTransaction: noOp,
    commitTransaction: noOp,
    rollbackTransaction: noOp,
    releaseConnection: noOp,
    destroy: noOp,
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

function expectedHistogram(
  values: number[],
  tailDirection: 'high' | 'low',
  bucketCount: number,
  sourceValues = values,
  sourceTransform: (value: number) => number = (value) => value,
) {
  return {
    buckets: originalBuildHistogram(values, bucketCount),
    percentiles: originalPercentiles(values, tailDirection, sourceValues, sourceTransform),
    n: values.length,
  };
}

const FORBIDDEN_RAW_PAYLOAD_KEYS: Record<string, true> = {
  throughputData: true,
  duration_ms: true,
  durationMs: true,
  ttft_ms: true,
  ttftMs: true,
  tpot_ms: true,
  tpotMs: true,
  prefill_speed: true,
  prefillSpeed: true,
  output_tokens: true,
  outputTokens: true,
  is_streaming: true,
  isStreaming: true,
};

function forbiddenRawPayloadPaths(value: unknown, path = 'payload'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => forbiddenRawPayloadPaths(item, `${path}[${index}]`));
  }
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    FORBIDDEN_RAW_PAYLOAD_KEYS[key]
      ? [`${path}.${key}`]
      : forbiddenRawPayloadPaths(child, `${path}.${key}`),
  );
}

describe('computePerformancePayload', () => {
  it('returns bounded 50-bin latency and 30-bin streaming distributions from one shared raw-data pass', async () => {
    const queries: CompiledQuery[] = [];
    const probe: QueryProbe = { active: 0, maxActive: 0 };
    const payload = await computePerformancePayload(fixtureDb(queries, probe), null, null, 7);
    const positiveTpot = tpotFixture.filter((value) => value > 0);
    const interactivity = positiveTpot
      .map((value) => 1_000 / value)
      .filter((value) => value <= 200);

    expect({
      distribution: payload.latency.distribution,
      ttftDistribution: payload.latency.ttftDistribution,
      tpotDistribution: payload.latency.tpotDistribution,
      prefillSpeedDistribution: payload.latency.prefillSpeedDistribution,
      interactivityDistribution: payload.latency.interactivityDistribution,
    }).toEqual({
      distribution: expectedHistogram(latencyFixture, 'high', 50),
      ttftDistribution: expectedHistogram(ttftFixture, 'high', 50),
      tpotDistribution: expectedHistogram(tpotFixture, 'high', 50),
      prefillSpeedDistribution: expectedHistogram(prefillFixture, 'low', 50),
      interactivityDistribution: expectedHistogram(
        interactivity,
        'low',
        50,
        positiveTpot,
        transformInteractivity,
      ),
    });

    expect({
      ttftDistribution: payload.streaming.ttftDistribution,
      tpotDistribution: payload.streaming.tpotDistribution,
      prefillSpeedDistribution: payload.streaming.prefillSpeedDistribution,
      interactivityDistribution: payload.streaming.interactivityDistribution,
      streamingLatencyDistribution: payload.streaming.streamingLatencyDistribution,
      nonStreamingLatencyDistribution: payload.streaming.nonStreamingLatencyDistribution,
      throughputDistribution: payload.streaming.throughputDistribution,
    }).toEqual({
      ttftDistribution: expectedHistogram(ttftFixture, 'high', 30),
      tpotDistribution: expectedHistogram(tpotFixture, 'high', 30),
      prefillSpeedDistribution: expectedHistogram(prefillFixture, 'high', 30),
      interactivityDistribution: expectedHistogram(
        interactivity,
        'high',
        30,
        positiveTpot,
        transformInteractivity,
      ),
      streamingLatencyDistribution: expectedHistogram([10, 20], 'high', 30),
      nonStreamingLatencyDistribution: expectedHistogram([30], 'high', 30),
      throughputDistribution: expectedHistogram([100, 200], 'high', 30),
    });

    expect(payload.streaming.ttftStats.p50).toBe(51);
    expect(
      payload.streaming.ttftDistribution.percentiles.filter(({ label }) =>
        ['p50', 'p90', 'p99'].includes(label),
      ),
    ).toEqual([
      { label: 'p50', value: 100 },
      { label: 'p90', value: 1_000 },
      { label: 'p99', value: 1_000 },
    ]);
    expect(payload.streaming.stats).not.toHaveProperty('throughputData');
    expect(forbiddenRawPayloadPaths(payload)).toEqual([]);

    const normalizedQueries = normalize(queries);
    expect(
      normalizedQueries.filter((sql) => sql.startsWith('select ttft_ms from requests')),
    ).toHaveLength(1);
    expect(
      normalizedQueries.filter((sql) => sql.startsWith('select tpot_ms from requests')),
    ).toHaveLength(1);
    expect(
      normalizedQueries.filter((sql) => sql.startsWith('select (coalesce(cache_read_input_tokens')),
    ).toHaveLength(1);
    expect(
      normalizedQueries.filter((sql) => sql.includes('requests.is_streaming as is_streaming')),
    ).toHaveLength(1);
    expect(probe.maxActive).toBeLessThanOrEqual(4);
    expect(probe.active).toBe(0);
  });
});

const assertSingleSharedRawSources = (queries: string[]) => {
  expect(queries.filter((sql) => sql.startsWith('select ttft_ms from requests'))).toHaveLength(1);
  expect(queries.filter((sql) => sql.startsWith('select tpot_ms from requests'))).toHaveLength(1);
  expect(
    queries.filter((sql) => sql.startsWith('select (coalesce(cache_read_input_tokens')),
  ).toHaveLength(1);
};

describe('branch-specific model performance payloads', () => {
  const model = 'controlled-model';
  const positiveTpot = tpotFixture.filter((value) => value > 0);
  const interactivity = positiveTpot.map((value) => 1_000 / value).filter((value) => value <= 200);

  it('computes only the latency model branch with exact 50-bin semantics', async () => {
    const queries: CompiledQuery[] = [];
    const probe: QueryProbe = { active: 0, maxActive: 0 };
    const payload = await computePerformanceLatencyPayload(
      fixtureDb(queries, probe),
      null,
      model,
      7,
    );
    const normalizedQueries = normalize(queries);

    expect(Object.keys(payload).toSorted()).toEqual(
      [
        'stats',
        'distribution',
        'hourly',
        'byModel',
        'cacheReadVsLatency',
        'cacheHeatmap',
        'cacheHeatmapByOutput',
        'ttftDistribution',
        'tpotDistribution',
        'ttftStats',
        'tpotStats',
        'cacheHeatmapTTFT',
        'cacheHeatmapPrefillSpeed',
        'prefillSpeedDistribution',
        'prefillSpeedStats',
        'cacheTotalVsOutputInteractivity',
        'interactivityDistribution',
      ].toSorted(),
    );
    expect({
      distribution: payload.distribution,
      ttftDistribution: payload.ttftDistribution,
      tpotDistribution: payload.tpotDistribution,
      prefillSpeedDistribution: payload.prefillSpeedDistribution,
      interactivityDistribution: payload.interactivityDistribution,
    }).toEqual({
      distribution: expectedHistogram(latencyFixture, 'high', 50),
      ttftDistribution: expectedHistogram(ttftFixture, 'high', 50),
      tpotDistribution: expectedHistogram(tpotFixture, 'high', 50),
      prefillSpeedDistribution: expectedHistogram(prefillFixture, 'low', 50),
      interactivityDistribution: expectedHistogram(
        interactivity,
        'low',
        50,
        positiveTpot,
        transformInteractivity,
      ),
    });
    expect(forbiddenRawPayloadPaths(payload)).toEqual([]);

    expect(queries).toHaveLength(16);
    expect(probe.maxActive).toBeLessThanOrEqual(4);
    expect(probe.active).toBe(0);
    assertSingleSharedRawSources(normalizedQueries);
    expect(queries.every((query) => query.parameters.includes(model))).toBe(true);
    expect(
      normalizedQueries.filter((sql) =>
        [
          'requests.is_streaming as is_streaming',
          'count(*) as total_count',
          "to_char(date_trunc('day'",
          'order by streaming_count desc',
        ].some((marker) => sql.includes(marker)),
      ),
    ).toEqual([]);
  });

  it('computes only the streaming model branch with exact 30-bin and output-token semantics', async () => {
    const queries: CompiledQuery[] = [];
    const probe: QueryProbe = { active: 0, maxActive: 0 };
    const payload = await computePerformanceStreamingPayload(
      fixtureDb(queries, probe),
      null,
      model,
      7,
    );
    const normalizedQueries = normalize(queries);

    expect(Object.keys(payload).toSorted()).toEqual(
      [
        'stats',
        'dailyRatio',
        'byModel',
        'ttftDistribution',
        'tpotDistribution',
        'ttftStats',
        'tpotStats',
        'prefillSpeedDistribution',
        'prefillSpeedStats',
        'interactivityDistribution',
        'streamingLatencyDistribution',
        'nonStreamingLatencyDistribution',
        'throughputDistribution',
      ].toSorted(),
    );
    expect({
      ttftDistribution: payload.ttftDistribution,
      tpotDistribution: payload.tpotDistribution,
      prefillSpeedDistribution: payload.prefillSpeedDistribution,
      interactivityDistribution: payload.interactivityDistribution,
      streamingLatencyDistribution: payload.streamingLatencyDistribution,
      nonStreamingLatencyDistribution: payload.nonStreamingLatencyDistribution,
      throughputDistribution: payload.throughputDistribution,
    }).toEqual({
      ttftDistribution: expectedHistogram(ttftFixture, 'high', 30),
      tpotDistribution: expectedHistogram(tpotFixture, 'high', 30),
      prefillSpeedDistribution: expectedHistogram(prefillFixture, 'high', 30),
      interactivityDistribution: expectedHistogram(
        interactivity,
        'high',
        30,
        positiveTpot,
        transformInteractivity,
      ),
      streamingLatencyDistribution: expectedHistogram([10, 20], 'high', 30),
      nonStreamingLatencyDistribution: expectedHistogram([30], 'high', 30),
      throughputDistribution: expectedHistogram([100, 200], 'high', 30),
    });
    expect(payload.stats).not.toHaveProperty('throughputData');
    expect(forbiddenRawPayloadPaths(payload)).toEqual([]);

    expect(queries).toHaveLength(10);
    expect(probe.maxActive).toBeLessThanOrEqual(4);
    expect(probe.active).toBe(0);
    assertSingleSharedRawSources(normalizedQueries);
    expect(queries.every((query) => query.parameters.includes(model))).toBe(true);
    expect(
      normalizedQueries.filter((sql) =>
        [
          'requests_today',
          'select requests.duration_ms as duration_ms from requests',
          "date_trunc('hour'",
          'order by p50 desc',
          'with bucketed as',
        ].some((marker) => sql.includes(marker)),
      ),
    ).toEqual([]);
  });
});

describe('computeFastModePayload', () => {
  it('preserves the bounded summary, daily, and per-model route response', async () => {
    const queries: CompiledQuery[] = [];

    await expect(computeFastModePayload(fixtureDb(queries), null, 7)).resolves.toEqual({
      summary: fastModeSummaryFixture,
      daily: fastModeDailyFixture,
      byModel: fastModeByModelFixture,
    });
    expect(queries).toHaveLength(3);
  });
});
