import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { CHART_SERIES_VERSION, type ChartSeries } from '../etl/compute-chart-series';
import type { DbClient } from '../connection.js';

import { getTraceServerMetrics, getTraceServerMetricSource } from './trace-server-metrics';

function currentSeries(): ChartSeries {
  return {
    version: CHART_SERIES_VERSION,
    startNs: 0,
    endNs: 1e9,
    durationS: 1,
    timeslicesCount: 1,
    kvCacheUsage: [],
    prefixCacheHitRate: [],
    queueDepth: [],
    promptTokensBySource: {},
    prefillTps: [{ t: 0, value: 100 }],
    decodeTps: [],
    prefixCacheHitsTps: [],
    hostKvCacheUsage: [],
    kvCacheUsageByEngine: [],
    metricSources: [],
  };
}

function metaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    trace_replay_id: 7,
    has_blob: true,
    chart_series: currentSeries(),
    hardware: 'gb200',
    framework: 'dynamo-vllm',
    model: 'deepseek-r1-0528',
    precision: 'fp8',
    spec_method: 'none',
    disagg: true,
    conc: 128,
    offload_mode: 'off',
    kv_offloading: null,
    kv_offload_backend: null,
    kv_offload_backend_version: null,
    kv_p2p_transfer: null,
    router_name: null,
    router_version: null,
    isl: null,
    osl: null,
    benchmark_type: 'agentic_traces',
    date: '2026-06-23',
    run_url: null,
    server_gpu_cache_hit_rate: null,
    server_cpu_cache_hit_rate: null,
    kv_cache_pool_tokens: null,
    ...overrides,
  };
}

function mockSql(queue: unknown[][]): { sql: DbClient; calls: string[] } {
  const responses = [...queue];
  const calls: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    calls.push(strings.join('?'));
    return Promise.resolve(responses.shift() ?? []);
  }) as unknown as DbClient;
  return { sql, calls };
}

describe('getTraceServerMetrics', () => {
  it('returns current precomputed series without selecting the raw blob', async () => {
    const { sql, calls } = mockSql([
      [
        metaRow({
          kv_offloading: 'dram',
          kv_offload_backend: 'lmcache',
          kv_offload_backend_version: '0.5.1',
          kv_p2p_transfer: 'mooncake',
          router_name: 'vllm-router',
          router_version: '0.1.14',
        }),
      ],
    ]);

    const result = await getTraceServerMetrics(sql, 42);

    expect(result?.prefillTps).toEqual([{ t: 0, value: 100 }]);
    expect(result?.meta).toMatchObject({
      kv_offloading: 'dram',
      kv_offload_backend: 'lmcache',
      kv_offload_backend_version: '0.5.1',
      kv_p2p_transfer: 'mooncake',
      router_name: 'vllm-router',
      router_version: '0.1.14',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain('server_metrics_json_gz as blob');
    expect(calls[0]).toContain("br.metrics ->> 'kv_offload_backend'");
  });

  it('fetches and computes the raw blob only when chart_series is stale', async () => {
    const raw = gzipSync(
      Buffer.from(
        JSON.stringify({
          metrics: {
            'vllm:prompt_tokens': {
              series: [{ timeslices: [{ start_ns: 0, end_ns: 1e9, rate: 321 }] }],
            },
          },
        }),
      ),
    );
    const stale = { ...currentSeries(), version: CHART_SERIES_VERSION - 1 };
    const { sql, calls } = mockSql([[metaRow({ chart_series: stale })], [{ blob: raw }]]);

    const result = await getTraceServerMetrics(sql, 42);

    expect(result?.prefillTps).toEqual([{ t: 0, value: 321 }]);
    // 3 calls: meta read, blob read, then the fire-and-forget chart_series
    // write-back that self-heals the stale precomputed series.
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain('server_metrics_json_gz as blob');
    expect(calls[2]).toContain('update agentic_trace_replay set chart_series');
    expect(calls[2]).toContain('::jsonb where id');
  });

  it('returns null without a blob and does not issue a second query', async () => {
    const { sql, calls } = mockSql([[metaRow({ has_blob: false, chart_series: null })]]);

    await expect(getTraceServerMetrics(sql, 42)).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe('getTraceServerMetricSource', () => {
  it('returns only the selected source from a current precomputed series', async () => {
    const metricSource = {
      source: {
        id: 'decode-0',
        adapter: 'vllm',
        role: 'decode' as const,
        endpointUrl: null,
        nativeRole: null,
        workerId: 'worker-0',
        dpRank: null,
        engine: null,
      },
      kvCacheUsage: [],
      prefixCacheHitRate: [],
      queueDepth: [],
      promptTokensBySource: {},
      promptTps: [{ t: 0, value: 10 }],
      generationTps: [{ t: 0, value: 20 }],
      prefixCacheHitsTps: [],
      hostKvCacheUsage: [],
      kvCacheUsageByEngine: [],
    };
    const { sql, calls } = mockSql([
      [
        {
          trace_replay_id: 7,
          has_blob: true,
          chart_series_version: CHART_SERIES_VERSION,
          framework: 'dynamo-vllm',
          disagg: true,
          metric_source: metricSource,
        },
      ],
    ]);

    await expect(getTraceServerMetricSource(sql, 42, 'decode-0')).resolves.toEqual(metricSource);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("metric_source->'source'->>'id'");
    expect(calls[0]).not.toContain('server_metrics_json_gz as blob');
  });
});

// ── All-endpoints KV overlay collapses per worker ───────────────────────
//
// `chart_series.kvCacheUsageByEngine` is per DP rank. On a PD-disaggregated
// run that is unreadable (6 prefill workers x DP4 + decode = 28 lines), so the
// read layer averages each worker's ranks into one line. Derived here, not in
// the ETL, so it needs no CHART_SERIES_VERSION bump or backfill.

/** One metric source (worker) owning `ranks` engines, each at a flat value. */
function workerSource(role: string, workerId: string, ranks: number[]) {
  return {
    source: {
      id: `dynamo|${role}|${workerId}`,
      adapter: 'dynamo',
      role,
      endpointUrl: `http://10.0.0.1:7500/metrics`,
      nativeRole: role,
      workerId,
      dpRank: null,
      engine: null,
    },
    kvCacheUsage: [],
    prefixCacheHitRate: [],
    queueDepth: [],
    promptTokensBySource: {},
    promptTps: [],
    generationTps: [],
    prefixCacheHitsTps: [],
    hostKvCacheUsage: [],
    kvCacheUsageByEngine: ranks.map((value, i) => ({
      engineLabel: `${role} ${i}`,
      points: [
        { t: 0, value },
        { t: 1, value },
      ],
    })),
  };
}

describe('getTraceServerMetrics all-endpoints KV overlay', () => {
  function run(metricSources: unknown[], fallback: unknown[] = []) {
    const series = {
      ...currentSeries(),
      kvCacheUsageByEngine: fallback,
      metricSources,
    } as unknown as ChartSeries;
    const { sql } = mockSql([[metaRow({ chart_series: series })]]);
    return getTraceServerMetrics(sql, 42);
  }

  it("averages each worker's ranks into one line", async () => {
    const result = await run([
      workerSource('prefill', 'wpre-aaaa', [0.1, 0.3]),
      workerSource('prefill', 'wpre-bbbb', [0.5, 0.7]),
      workerSource('decode', 'wdec-cccc', [0.3, 0.5]),
    ]);
    expect(result?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual([
      'prefill aaaa',
      'prefill bbbb',
      'decode',
    ]);
    expect(result?.kvCacheUsageByEngine.map((e) => e.points[0]!.value)).toEqual([0.2, 0.6, 0.4]);
  });

  it('keeps the stored per-rank overlay for a single-worker run', async () => {
    // A plain DP deployment has no per-source data; rank skew is the signal
    // there, so the stored per-rank lines must survive untouched.
    const perRank = [
      { engineLabel: '0', points: [{ t: 0, value: 0.1 }] },
      { engineLabel: '1', points: [{ t: 0, value: 0.9 }] },
    ];
    const result = await run([], perRank);
    expect(result?.kvCacheUsageByEngine).toEqual(perRank);
  });

  it('leaves workers that already own one engine each alone', async () => {
    const perRank = [{ engineLabel: 'prefill 0', points: [{ t: 0, value: 0.2 }] }];
    const result = await run(
      [workerSource('prefill', 'wpre-aaaa', [0.2]), workerSource('decode', 'wdec-cccc', [0.4])],
      perRank,
    );
    expect(result?.kvCacheUsageByEngine).toEqual(perRank);
  });

  it('still trims metricSources to descriptors', async () => {
    const result = await run([
      workerSource('prefill', 'wpre-aaaa', [0.1, 0.3]),
      workerSource('decode', 'wdec-cccc', [0.3, 0.5]),
    ]);
    expect(result?.metricSources).toHaveLength(2);
    expect(Object.keys(result!.metricSources[0]!)).toEqual(['source']);
  });
});
