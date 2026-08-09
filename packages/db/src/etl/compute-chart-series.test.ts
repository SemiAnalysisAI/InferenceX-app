import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { CHART_SERIES_VERSION, computeChartSeries } from './compute-chart-series.js';

/**
 * Build a minimal server_metrics_json blob covering the metrics the chart
 * consumes. Each timeslice is one second long starting at t=0.
 */
function makeBlob(opts?: {
  prefixHits?: number;
  prefixQueries?: number;
  promptTokensRate?: number;
}) {
  const json = JSON.stringify({
    metrics: {
      'vllm:kv_cache_usage_perc': {
        series: [
          {
            timeslices: [
              { start_ns: 0, end_ns: 1e9, avg: 0.1 },
              { start_ns: 1e9, end_ns: 2e9, avg: 0.4 },
              { start_ns: 2e9, end_ns: 3e9, avg: 0.7 },
            ],
          },
        ],
      },
      'vllm:prefix_cache_hits': {
        series: [{ timeslices: [{ start_ns: 0, end_ns: 1e9, rate: opts?.prefixHits ?? 75 }] }],
      },
      'vllm:prefix_cache_queries': {
        series: [{ timeslices: [{ start_ns: 0, end_ns: 1e9, rate: opts?.prefixQueries ?? 100 }] }],
      },
      'vllm:num_requests_running': {
        series: [{ timeslices: [{ start_ns: 0, end_ns: 1e9, avg: 5 }] }],
      },
      'vllm:num_requests_waiting': {
        series: [{ timeslices: [{ start_ns: 0, end_ns: 1e9, avg: 2 }] }],
      },
      'vllm:prompt_tokens': {
        series: [
          { timeslices: [{ start_ns: 0, end_ns: 1e9, rate: opts?.promptTokensRate ?? 1000 }] },
        ],
      },
      'vllm:generation_tokens': {
        series: [{ timeslices: [{ start_ns: 0, end_ns: 1e9, rate: 500 }] }],
      },
      'vllm:prompt_tokens_by_source': {
        series: [
          {
            labels: { source: 'local_cache_hit' },
            timeslices: [{ start_ns: 0, end_ns: 1e9, rate: 200 }],
          },
          {
            labels: { source: 'miss' },
            timeslices: [{ start_ns: 0, end_ns: 1e9, rate: 800 }],
          },
        ],
      },
    },
  });
  return gzipSync(Buffer.from(json));
}

/** Build a synthetic per-engine vLLM metric series for the multi-engine test. */
function buildEngineSeries(engineId: number, baseRunning: number) {
  const labels = { engine: String(engineId) };
  return {
    runningSlice: {
      labels,
      timeslices: [
        { start_ns: 0, avg: baseRunning },
        { start_ns: 1e9, avg: baseRunning + 1 },
      ],
    },
    waitingSlice: {
      labels,
      timeslices: [
        { start_ns: 0, avg: 0 },
        { start_ns: 1e9, avg: 0 },
      ],
    },
    kvSlice: {
      labels,
      timeslices: [
        { start_ns: 0, avg: 0.25 },
        { start_ns: 1e9, avg: 0.5 },
      ],
    },
    promptSlice: {
      labels,
      timeslices: [
        { start_ns: 0, rate: 100 },
        { start_ns: 1e9, rate: 200 },
      ],
    },
    genSlice: {
      labels,
      timeslices: [
        { start_ns: 0, rate: 50 },
        { start_ns: 1e9, rate: 75 },
      ],
    },
  };
}

function buildDynamoSeries(
  endpoint_url: string,
  dynamo_component: 'prefill' | 'backend',
  worker_id: string,
  value: number,
  field: 'rate' | 'avg' = 'rate',
) {
  return {
    endpoint_url,
    labels: { dynamo_component, worker_id, dp_rank: '0', engine: '0' },
    timeslices: [{ start_ns: 0, end_ns: 1e9, [field]: value }],
  };
}

/** A kv_cache_usage_perc series for one engine as seen from one endpoint. */
function kvSeriesFor(
  endpoint_url: string,
  labels: Record<string, string>,
  samples: [startNs: number, avg: number][],
) {
  return {
    endpoint_url,
    labels,
    timeslices: samples.map(([start_ns, avg]) => ({ start_ns, end_ns: start_ns + 1e9, avg })),
  };
}

/** Gzip a blob carrying only kv_cache_usage_perc, optionally in both phases. */
function kvBlob(profiling: unknown[], warmup: unknown[] = []) {
  return gzipSync(
    Buffer.from(
      JSON.stringify({
        metrics: { 'vllm:kv_cache_usage_perc': { series: profiling } },
        ...(warmup.length > 0
          ? { warmup_metrics: { 'vllm:kv_cache_usage_perc': { series: warmup } } }
          : {}),
      }),
    ),
  );
}

describe('computeChartSeries', () => {
  it('returns null when the blob is null', async () => {
    expect(await computeChartSeries(null)).toBeNull();
  });

  it('returns the current CHART_SERIES_VERSION in the bundle', async () => {
    const series = await computeChartSeries(makeBlob());
    expect(series?.version).toBe(CHART_SERIES_VERSION);
  });

  it('extracts kvCacheUsage points with t=seconds-from-start', async () => {
    const series = await computeChartSeries(makeBlob());
    expect(series?.kvCacheUsage).toEqual([
      { t: 0, value: 0.1 },
      { t: 1, value: 0.4 },
      { t: 2, value: 0.7 },
    ]);
  });

  it('merges warmup_metrics before profiling into one continuous series (v11)', async () => {
    // warmup scrapes at t=0,1s; profiling scrapes at t=10,11s (own start_ns).
    const blob = gzipSync(
      Buffer.from(
        JSON.stringify({
          warmup_metrics: {
            'vllm:kv_cache_usage_perc': {
              series: [
                {
                  timeslices: [
                    { start_ns: 0, end_ns: 1e9, avg: 0.2 },
                    { start_ns: 1e9, end_ns: 2e9, avg: 0.3 },
                  ],
                },
              ],
            },
          },
          metrics: {
            'vllm:kv_cache_usage_perc': {
              series: [
                {
                  timeslices: [
                    { start_ns: 10e9, end_ns: 11e9, avg: 0.8 },
                    { start_ns: 11e9, end_ns: 12e9, avg: 0.9 },
                  ],
                },
              ],
            },
          },
        }),
      ),
    );
    const series = await computeChartSeries(blob);
    // Origin is the earliest (warmup) start_ns, so warmup sits at low t and
    // profiling follows on the same axis — the frontend slices at the boundary.
    expect(series?.kvCacheUsage).toEqual([
      { t: 0, value: 0.2 },
      { t: 1, value: 0.3 },
      { t: 10, value: 0.8 },
      { t: 11, value: 0.9 },
    ]);
  });

  it('computes prefixCacheHitRate as hits.rate / queries.rate', async () => {
    const series = await computeChartSeries(makeBlob({ prefixHits: 80, prefixQueries: 100 }));
    expect(series?.prefixCacheHitRate).toEqual([{ t: 0, value: 0.8 }]);
  });

  it('drops prefixCacheHitRate windows where queries.rate is 0', async () => {
    const series = await computeChartSeries(makeBlob({ prefixHits: 5, prefixQueries: 0 }));
    expect(series?.prefixCacheHitRate).toEqual([]);
  });

  it('pairs running + waiting into queueDepth points', async () => {
    const series = await computeChartSeries(makeBlob());
    expect(series?.queueDepth).toEqual([{ t: 0, running: 5, waiting: 2, total: 7 }]);
  });

  it('extracts prefillTps + decodeTps from counter rates', async () => {
    const series = await computeChartSeries(makeBlob());
    expect(series?.prefillTps).toEqual([{ t: 0, value: 1000 }]);
    expect(series?.decodeTps).toEqual([{ t: 0, value: 500 }]);
  });

  it('splits promptTokensBySource by label and skips empty series', async () => {
    const series = await computeChartSeries(makeBlob());
    expect(Object.keys(series!.promptTokensBySource).toSorted()).toEqual([
      'local_cache_hit',
      'miss',
    ]);
    expect(series!.promptTokensBySource['local_cache_hit']).toEqual([{ t: 0, value: 200 }]);
    expect(series!.promptTokensBySource['miss']).toEqual([{ t: 0, value: 800 }]);
  });

  it('computes timing metadata from the widest metric window', async () => {
    const series = await computeChartSeries(makeBlob());
    // kvCacheUsage has the widest window (0 → 3e9), so startNs=0, endNs=3e9.
    expect(series?.startNs).toBe(0);
    expect(series?.endNs).toBe(3e9);
    expect(series?.durationS).toBeCloseTo(3, 6);
    expect(series?.timeslicesCount).toBe(3);
  });

  it('returns null on a malformed (non-gzip) blob', async () => {
    const result = await computeChartSeries(Buffer.from('not-gzip-data'));
    expect(result).toBeNull();
  });

  it('aggregates gauges + counters across all engine series (DP/PP fix)', async () => {
    // Simulate a 4-engine deployment: each engine reports its own series for
    // every metric. Cluster-wide value should be SUM for running/waiting and
    // counter rates, AVG for kv_cache_usage_perc (per-engine fraction).
    const engines = [0, 1, 2, 3].map((id) => buildEngineSeries(id, 3)); // running=3 per engine
    const json = JSON.stringify({
      metrics: {
        'vllm:num_requests_running': { series: engines.map((e) => e.runningSlice) },
        'vllm:num_requests_waiting': { series: engines.map((e) => e.waitingSlice) },
        'vllm:kv_cache_usage_perc': { series: engines.map((e) => e.kvSlice) },
        'vllm:prompt_tokens': { series: engines.map((e) => e.promptSlice) },
        'vllm:generation_tokens': { series: engines.map((e) => e.genSlice) },
      },
    });
    const blob = gzipSync(Buffer.from(json));
    const cs = await computeChartSeries(blob);
    expect(cs).not.toBeNull();
    // queueDepth.running = Σ engines = 4 × 3 = 12 at t=0; 4 × 4 = 16 at t=1
    expect(cs!.queueDepth).toEqual([
      { t: 0, running: 12, waiting: 0, total: 12 },
      { t: 1, running: 16, waiting: 0, total: 16 },
    ]);
    // kvCacheUsage stays 0.25, 0.5 (average across engines, all engines reported same value)
    expect(cs!.kvCacheUsage).toEqual([
      { t: 0, value: 0.25 },
      { t: 1, value: 0.5 },
    ]);
    // prefillTps = Σ rates = 4 × 100 = 400; then 4 × 200 = 800
    expect(cs!.prefillTps).toEqual([
      { t: 0, value: 400 },
      { t: 1, value: 800 },
    ]);
    expect(cs!.decodeTps).toEqual([
      { t: 0, value: 200 },
      { t: 1, value: 300 },
    ]);
  });

  it('uses the Dynamo adapter to preserve workers and canonical prefill/decode roles', async () => {
    const json = JSON.stringify({
      metrics: {
        'vllm:prompt_tokens': {
          series: [
            buildDynamoSeries('prefill-a.internal.test:7500', 'prefill', 'prefill-a', 100),
            buildDynamoSeries('prefill-b.internal.test:7508', 'prefill', 'prefill-b', 200),
            buildDynamoSeries('decode-a.internal.test:7516', 'backend', 'decode-a', 300),
          ],
        },
        'vllm:generation_tokens': {
          series: [
            buildDynamoSeries('prefill-a.internal.test:7500', 'prefill', 'prefill-a', 1),
            buildDynamoSeries('prefill-b.internal.test:7508', 'prefill', 'prefill-b', 2),
            buildDynamoSeries('decode-a.internal.test:7516', 'backend', 'decode-a', 400),
          ],
        },
        'vllm:num_requests_running': {
          series: [
            buildDynamoSeries('prefill-a.internal.test:7500', 'prefill', 'prefill-a', 3, 'avg'),
            buildDynamoSeries('prefill-b.internal.test:7508', 'prefill', 'prefill-b', 4, 'avg'),
            buildDynamoSeries('decode-a.internal.test:7516', 'backend', 'decode-a', 5, 'avg'),
          ],
        },
      },
    });

    const blob = gzipSync(Buffer.from(json));
    const result = await computeChartSeries(blob, {
      framework: 'dynamo-vllm',
      disagg: true,
    });

    expect(result?.metricSources).toHaveLength(3);
    expect(result?.metricSources.map(({ source: s }) => [s.role, s.workerId, s.engine])).toEqual([
      ['prefill', 'prefill-a', '0'],
      ['prefill', 'prefill-b', '0'],
      ['decode', 'decode-a', '0'],
    ]);
    const prefillA = result?.metricSources.find(({ source: s }) => s.workerId === 'prefill-a');
    const decode = result?.metricSources.find(({ source: s }) => s.role === 'decode');
    expect(prefillA?.promptTps).toEqual([{ t: 0, value: 100 }]);
    expect(prefillA?.queueDepth).toEqual([{ t: 0, running: 3, waiting: 0, total: 3 }]);
    expect(decode?.generationTps).toEqual([{ t: 0, value: 400 }]);

    const nonDisagg = await computeChartSeries(blob, {
      framework: 'dynamo-vllm',
      disagg: false,
    });
    expect(nonDisagg?.metricSources).toEqual([]);
  });

  // ── Per-engine identity (v13) ─────────────────────────────────────────
  //
  // The blob stores one series per (scrape endpoint x phase block x label
  // set), which is not one series per engine. These cover the three ways
  // that mismatch used to inflate `kvCacheUsageByEngine` and fragment the
  // cluster average.

  it('collapses API-server frontends that mirror the same engines', async () => {
    // vLLM with two API servers exposes every DP rank on BOTH /metrics
    // endpoints, scraped a fraction of a second apart. That is 4 series for
    // 2 engines, not 4 engines.
    const cs = await computeChartSeries(
      kvBlob([
        kvSeriesFor('http://localhost:8895/metrics', { engine: '0', model_name: 'm' }, [
          [0, 0.2],
          [1e9, 0.3],
        ]),
        kvSeriesFor('http://localhost:8895/metrics', { engine: '1', model_name: 'm' }, [
          [0, 0.6],
          [1e9, 0.7],
        ]),
        kvSeriesFor('http://localhost:8896/metrics', { engine: '0', model_name: 'm' }, [
          [0.176e9, 0.2],
          [1.176e9, 0.3],
        ]),
        kvSeriesFor('http://localhost:8896/metrics', { engine: '1', model_name: 'm' }, [
          [0.176e9, 0.6],
          [1.176e9, 0.7],
        ]),
      ]),
    );
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual(['0', '1']);
    // The mean is over the two real engines, once per scrape tick — not four
    // ticks averaging one endpoint's subset each.
    expect(cs?.kvCacheUsage).toEqual([
      { t: 0, value: 0.4 },
      { t: 1, value: 0.5 },
    ]);
  });

  it('joins an engine warmup and profiling scrapes into one line', async () => {
    const cs = await computeChartSeries(
      kvBlob(
        [
          kvSeriesFor('http://localhost:8000/metrics', { engine: '0' }, [[10e9, 0.8]]),
          kvSeriesFor('http://localhost:8000/metrics', { engine: '1' }, [[10e9, 0.4]]),
        ],
        [
          kvSeriesFor('http://localhost:8000/metrics', { engine: '0' }, [[0, 0.2]]),
          kvSeriesFor('http://localhost:8000/metrics', { engine: '1' }, [[0, 0.1]]),
        ],
      ),
    );
    expect(cs?.kvCacheUsageByEngine).toEqual([
      {
        engineLabel: '0',
        points: [
          { t: 0, value: 0.2 },
          { t: 10, value: 0.8 },
        ],
      },
      {
        engineLabel: '1',
        points: [
          { t: 0, value: 0.1 },
          { t: 10, value: 0.4 },
        ],
      },
    ]);
  });

  it('suppresses the per-engine overlay for a single-engine deployment', async () => {
    // Warmup + profiling is two series but still one engine, so there is
    // nothing for a per-rank overlay to compare.
    const cs = await computeChartSeries(
      kvBlob(
        [kvSeriesFor('http://localhost:8000/metrics', { engine: '0' }, [[10e9, 0.8]])],
        [kvSeriesFor('http://localhost:8000/metrics', { engine: '0' }, [[0, 0.2]])],
      ),
    );
    expect(cs?.kvCacheUsageByEngine).toEqual([]);
    expect(cs?.kvCacheUsage).toEqual([
      { t: 0, value: 0.2 },
      { t: 10, value: 0.8 },
    ]);
  });

  it('keeps disaggregated workers apart even when their ranks collide', async () => {
    // Prefill rank 0 and decode rank 0 are different engines; `worker_id`
    // is what says so.
    const cs = await computeChartSeries(
      kvBlob([
        kvSeriesFor(
          'http://10.0.0.1:7500/metrics',
          { dp_rank: '0', engine_type: 'prefill', worker_id: 'aaaaaaaawork0001' },
          [[0, 0.02]],
        ),
        kvSeriesFor(
          'http://10.0.0.2:7502/metrics',
          { dp_rank: '0', engine_type: 'decode', worker_id: 'bbbbbbbbwork0002' },
          [[0, 0.5]],
        ),
      ]),
    );
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual(['prefill 0', 'decode 0']);
    expect(cs?.kvCacheUsage).toEqual([{ t: 0, value: 0.26 }]);
  });

  it('collapses tensor-parallel shard ranks that share one KV pool', async () => {
    // A TP4 SGLang worker reports kv_cache_usage_perc once per tp_rank, but
    // the four ranks shard a single pool and track each other to ~4dp. They
    // are one engine, not four.
    const shards = [0, 1, 2, 3].map((tp) =>
      kvSeriesFor(
        'http://10.0.0.1:7500/metrics',
        {
          tp_rank: String(tp),
          pp_rank: '0',
          moe_ep_rank: String(tp),
          engine_type: 'prefill',
          worker_id: 'worker-aaaa',
        },
        [
          [0, 0.4 + tp * 0.0001],
          [1e9, 0.6 + tp * 0.0001],
        ],
      ),
    );
    const cs = await computeChartSeries(kvBlob(shards));
    // One pool -> one engine, so the per-rank overlay stays off entirely.
    expect(cs?.kvCacheUsageByEngine).toEqual([]);
    expect(cs?.kvCacheUsage).toEqual([
      { t: 0, value: 0.40015 },
      { t: 1, value: 0.60015 },
    ]);
  });

  it('keeps DP ranks apart even when shard ranks co-vary with them', async () => {
    // Same worker, but now dp_rank names a real per-rank pool and tp_rank
    // happens to move with it. Dropping shard labels must not fuse these.
    const cs = await computeChartSeries(
      kvBlob(
        [0, 1].map((dp) =>
          kvSeriesFor(
            'http://10.0.0.1:7500/metrics',
            {
              dp_rank: String(dp),
              tp_rank: String(dp),
              engine_type: 'prefill',
              worker_id: 'worker-aaaa',
            },
            [[0, dp === 0 ? 0.2 : 0.8]],
          ),
        ),
      ),
    );
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual(['prefill 0', 'prefill 1']);
    expect(cs?.kvCacheUsage).toEqual([{ t: 0, value: 0.5 }]);
  });

  it('qualifies engines whose display label would otherwise collide', async () => {
    // Two decode workers that each number their ranks from 0.
    const cs = await computeChartSeries(
      kvBlob([
        kvSeriesFor(
          'http://10.0.0.1:7502/metrics',
          { dp_rank: '0', engine_type: 'decode', worker_id: 'worker-a01a' },
          [[0, 0.4]],
        ),
        kvSeriesFor(
          'http://10.0.0.2:7503/metrics',
          { dp_rank: '0', engine_type: 'decode', worker_id: 'worker-b01b' },
          [[0, 0.6]],
        ),
      ]),
    );
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual([
      'decode 0 (a01a)',
      'decode 0 (b01b)',
    ]);
  });

  it('averages engines on unaligned scrape grids without sawtoothing', async () => {
    // A prefill worker and a decode worker on their own sub-second grids.
    // Grouping on an exact start_ns made every tick "prefill only" (0.0) or
    // "decode only" (1.0), i.e. a full-scale sawtooth where the real cluster
    // mean is a flat 0.5.
    const prefill: [number, number][] = [];
    const decode: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      prefill.push([i * 1e9, 0]);
      decode.push([i * 1e9 + 0.5e9, 1]);
    }
    const cs = await computeChartSeries(
      kvBlob([
        kvSeriesFor(
          'http://10.0.0.1:7500/metrics',
          { worker_id: 'p', engine_type: 'prefill' },
          prefill,
        ),
        kvSeriesFor(
          'http://10.0.0.2:7502/metrics',
          { worker_id: 'd', engine_type: 'decode' },
          decode,
        ),
      ]),
    );
    // The edge ticks fall outside one engine's observed window — t=0 predates
    // decode's first scrape, t=9.5 postdates prefill's last — so they report
    // the one engine that was actually running rather than a carried-forward
    // stale value. Every tick in between averages both and stays flat.
    expect(cs?.kvCacheUsage.at(0)).toEqual({ t: 0, value: 0 });
    expect(cs?.kvCacheUsage.at(-1)).toEqual({ t: 9.5, value: 1 });
    const both = cs!.kvCacheUsage.slice(1, -1);
    expect(both).toHaveLength(18);
    expect(both.every((p) => p.value === 0.5)).toBe(true);
  });

  it('does not interpret Dynamo-native labels without selecting the Dynamo adapter', async () => {
    const json = JSON.stringify({
      metrics: {
        'vllm:prompt_tokens': {
          series: [
            {
              endpoint_url: 'prefill-a.internal.test:7500',
              labels: { dynamo_component: 'prefill', worker_id: 'prefill-a', engine: '0' },
              timeslices: [{ start_ns: 0, end_ns: 1e9, rate: 100 }],
            },
          ],
        },
      },
    });

    const result = await computeChartSeries(gzipSync(Buffer.from(json)), {
      framework: 'vllm',
      disagg: true,
    });

    expect(result?.metricSources).toEqual([]);
  });
});
