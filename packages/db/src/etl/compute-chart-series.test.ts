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
            buildDynamoSeries('10.30.1.56:7500', 'prefill', 'prefill-a', 100),
            buildDynamoSeries('10.30.1.36:7508', 'prefill', 'prefill-b', 200),
            buildDynamoSeries('10.30.1.206:7516', 'backend', 'decode-a', 300),
          ],
        },
        'vllm:generation_tokens': {
          series: [
            buildDynamoSeries('10.30.1.56:7500', 'prefill', 'prefill-a', 1),
            buildDynamoSeries('10.30.1.36:7508', 'prefill', 'prefill-b', 2),
            buildDynamoSeries('10.30.1.206:7516', 'backend', 'decode-a', 400),
          ],
        },
        'vllm:num_requests_running': {
          series: [
            buildDynamoSeries('10.30.1.56:7500', 'prefill', 'prefill-a', 3, 'avg'),
            buildDynamoSeries('10.30.1.36:7508', 'prefill', 'prefill-b', 4, 'avg'),
            buildDynamoSeries('10.30.1.206:7516', 'backend', 'decode-a', 5, 'avg'),
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
      ['prefill', 'prefill-b', '0'],
      ['prefill', 'prefill-a', '0'],
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

  it('does not interpret Dynamo-native labels without selecting the Dynamo adapter', async () => {
    const json = JSON.stringify({
      metrics: {
        'vllm:prompt_tokens': {
          series: [
            {
              endpoint_url: '10.30.1.56:7500',
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
