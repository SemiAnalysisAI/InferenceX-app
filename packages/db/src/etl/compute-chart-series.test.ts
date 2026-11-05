import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { CHART_SERIES_VERSION, computeChartSeries } from './compute-chart-series.js';

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

function buildTrtllmSeries(
  endpoint_url: string,
  dynamo_component: 'prefill' | 'backend',
  value: number,
  field: 'rate' | 'avg' | 'sum',
  durationNs = 1e9,
) {
  return {
    endpoint_url,
    labels: { dynamo_component, worker_id: `${dynamo_component}-worker` },
    timeslices: [{ start_ns: 0, end_ns: durationNs, [field]: value }],
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
    const engines = [0, 1, 2, 3].map((id) => buildEngineSeries(id, 3));
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
    expect(cs!.queueDepth).toEqual([
      { t: 0, running: 12, waiting: 0, total: 12 },
      { t: 1, running: 16, waiting: 0, total: 16 },
    ]);
    expect(cs!.kvCacheUsage).toEqual([
      { t: 0, value: 0.25 },
      { t: 1, value: 0.5 },
    ]);
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
      ['prefill', 'prefill-a', null],
      ['prefill', 'prefill-b', null],
      ['decode', 'decode-a', null],
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

  it('collapses API-server frontends that mirror the same engines', async () => {
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
    expect(cs?.kvCacheUsageByEngine).toEqual([]);
    expect(cs?.kvCacheUsage).toEqual([
      { t: 0, value: 0.40015 },
      { t: 1, value: 0.60015 },
    ]);
  });

  it('keeps DP ranks apart even when shard ranks co-vary with them', async () => {
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
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual(['0', '1']);
    expect(cs?.kvCacheUsage).toEqual([{ t: 0, value: 0.5 }]);
  });

  it('keeps DP ranks in rank order regardless of the order the exporter emits', async () => {
    const cs = await computeChartSeries(
      kvBlob(
        [3, 1, 0, 2].map((rank) =>
          kvSeriesFor(
            `http://10.30.1.${100 + rank}:7500/metrics`,
            { engine: String(rank), dynamo_component: 'backend', worker_id: `w${rank}` },
            [[0, [0.25, 0.5, 0.75, 1][rank]!]],
          ),
        ),
      ),
      { framework: 'dynamo-vllm', disagg: false },
    );
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual(['0', '1', '2', '3']);
    expect(cs?.kvCacheUsageByEngine.map((e) => e.points[0]!.value)).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('names the role only when engines actually differ in role', async () => {
    const cs = await computeChartSeries(
      kvBlob([
        kvSeriesFor(
          'http://10.0.0.2:7502/metrics',
          { dp_rank: '0', engine_type: 'decode', worker_id: 'dec' },
          [[0, 0.6]],
        ),
        kvSeriesFor(
          'http://10.0.0.1:7500/metrics',
          { dp_rank: '0', engine_type: 'prefill', worker_id: 'pre' },
          [[0, 0.2]],
        ),
      ]),
    );
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual(['prefill 0', 'decode 0']);
  });

  it('falls through to dynamo_component when engine_type has no role mapping', async () => {
    const cs = await computeChartSeries(
      kvBlob([
        kvSeriesFor(
          'http://10.0.0.1:7500/metrics',
          { engine_type: 'unified', dynamo_component: 'prefill', worker_id: 'pre', dp_rank: '0' },
          [[0, 0.2]],
        ),
        kvSeriesFor(
          'http://10.0.0.2:7502/metrics',
          { engine_type: 'unified', dynamo_component: 'backend', worker_id: 'dec', dp_rank: '0' },
          [[0, 0.6]],
        ),
      ]),
    );
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual(['prefill 0', 'decode 0']);
  });

  it('qualifies engines whose display label would otherwise collide', async () => {
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
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual(['0 (a01a)', '0 (b01b)']);
  });

  it('keeps same-label endpoints apart when their values disagree', async () => {
    const labels = { engine_type: 'unified', model_name: 'm', tp_rank: '0' };
    const cs = await computeChartSeries(
      kvBlob([
        kvSeriesFor('http://node-a:8888/metrics', labels, [
          [0, 0.1],
          [1e9, 0.1],
        ]),
        kvSeriesFor('http://node-b:8888/metrics', labels, [
          [0, 0.9],
          [1e9, 0.9],
        ]),
      ]),
    );
    expect(cs?.kvCacheUsageByEngine.map((e) => e.engineLabel)).toEqual([
      'node-a:8888',
      'node-b:8888',
    ]);
    expect(cs?.kvCacheUsage).toEqual([
      { t: 0, value: 0.5 },
      { t: 1, value: 0.5 },
    ]);
  });

  it('prefers the mirror that covers the most wall-clock, not the densest', async () => {
    const labels = { engine: '0', model_name: 'm' };
    const long: [number, number][] = Array.from({ length: 11 }, (_, i) => [i * 1e9, 0.5]);
    const dense: [number, number][] = Array.from({ length: 12 }, (_, i) => [i * 1e8, 0.5]);
    const cs = await computeChartSeries(
      kvBlob([
        kvSeriesFor('http://a:8000/metrics', labels, dense),
        kvSeriesFor('http://b:8000/metrics', labels, long),
      ]),
    );
    expect(cs?.kvCacheUsage).toHaveLength(11);
    expect(cs?.kvCacheUsage.at(-1)?.t).toBe(10);
  });

  it('drops an engine from the mean while it stops reporting', async () => {
    const a: [number, number][] = [];
    const b: [number, number][] = [];
    for (let i = 0; i < 10; i++) a.push([i * 1e9, 1]);
    for (let i = 310; i < 320; i++) a.push([i * 1e9, 1]);
    for (let i = 0; i < 320; i++) b.push([i * 1e9, 0]);
    const cs = await computeChartSeries(
      kvBlob([
        kvSeriesFor('http://a:8000/metrics', { engine: '0' }, a),
        kvSeriesFor('http://a:8000/metrics', { engine: '1' }, b),
      ]),
    );
    const at = (t: number) => cs?.kvCacheUsage.find((p) => p.t === t)?.value;
    expect(at(5)).toBe(0.5);
    expect(at(150)).toBe(0);
    expect(at(315)).toBe(0.5);
  });

  it('averages engines on unaligned scrape grids without sawtoothing', async () => {
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

  it('extracts native TensorRT-LLM metrics and preserves disaggregated worker roles', async () => {
    const prefillUrl = 'http://prefill-a.internal.test:7500/metrics';
    const decodeUrl = 'http://decode-a.internal.test:7501/metrics';
    const json = JSON.stringify({
      metrics: {
        trtllm_kv_cache_utilization: {
          series: [
            buildTrtllmSeries(prefillUrl, 'prefill', 0.3, 'avg'),
            buildTrtllmSeries(decodeUrl, 'backend', 0.7, 'avg'),
          ],
        },
        trtllm_kv_cache_host_utilization: {
          series: [buildTrtllmSeries(prefillUrl, 'prefill', 0.25, 'avg')],
        },
        trtllm_prefill_batch_tokens: {
          series: [
            buildTrtllmSeries(prefillUrl, 'prefill', 30, 'sum', 0.5e9),
            buildTrtllmSeries(decodeUrl, 'backend', 60, 'sum', 0.5e9),
          ],
        },
        trtllm_prompt_cached_tokens: {
          series: [
            buildTrtllmSeries(prefillUrl, 'prefill', 40, 'rate'),
            buildTrtllmSeries(decodeUrl, 'backend', 80, 'rate'),
          ],
        },
        trtllm_generation_tokens: {
          series: [buildTrtllmSeries(decodeUrl, 'backend', 50, 'rate')],
        },
        trtllm_num_requests_running: {
          series: [
            buildTrtllmSeries(prefillUrl, 'prefill', 2, 'avg'),
            buildTrtllmSeries(decodeUrl, 'backend', 3, 'avg'),
          ],
        },
        trtllm_num_requests_waiting: {
          series: [buildTrtllmSeries(decodeUrl, 'backend', 4, 'avg')],
        },
      },
    });

    const result = await computeChartSeries(gzipSync(Buffer.from(json)), {
      framework: 'trtllm',
      disagg: true,
    });

    expect(result?.kvCacheUsage).toEqual([{ t: 0, value: 0.5 }]);
    expect(result?.hostKvCacheUsage).toEqual([{ t: 0, value: 0.25 }]);
    expect(result?.prefixCacheHitRate).toEqual([{ t: 0, value: 0.4 }]);
    expect(result?.queueDepth).toEqual([{ t: 0, running: 5, waiting: 4, total: 9 }]);
    expect(result?.prefillTps).toEqual([{ t: 0, value: 300 }]);
    expect(result?.decodeTps).toEqual([{ t: 0, value: 50 }]);
    expect(result?.promptTokensBySource).toEqual({
      'cache hit (HBM)': [{ t: 0, value: 120 }],
      'compute (miss)': [{ t: 0, value: 180 }],
    });
    expect(result?.metricSources.map(({ source }) => [source.role, source.endpointUrl])).toEqual([
      ['prefill', prefillUrl],
      ['decode', decodeUrl],
    ]);
    expect(result?.metricSources[0]?.promptTps).toEqual([{ t: 0, value: 100 }]);
    expect(result?.metricSources[1]?.generationTps).toEqual([{ t: 0, value: 50 }]);
  });

  it('keeps Dynamo TRT ranks within each worker and falls back to native-only endpoints', async () => {
    const prefillUrls = ['http://prefill-a:7500/metrics', 'http://prefill-b:7500/metrics'];
    const decodeUrl = 'http://decode:7500/metrics';
    const result = await computeChartSeries(
      gzipSync(
        Buffer.from(
          JSON.stringify({
            metrics: {
              trtllm_kv_cache_utilization: {
                series: [
                  ...prefillUrls.map((url) => buildTrtllmSeries(url, 'prefill', 0.9, 'avg')),
                  buildTrtllmSeries(decodeUrl, 'backend', 0.8, 'avg'),
                ],
              },
              dynamo_component_gpu_cache_usage_percent: {
                series: prefillUrls.flatMap((endpoint_url) =>
                  [0, 1].map((rank) => ({
                    endpoint_url,
                    labels: {
                      dynamo_component: 'prefill',
                      model: 'GLM-5.2-NVFP4',
                      dp_rank: String(rank),
                    },
                    timeslices: [{ start_ns: 0, end_ns: 1e9, avg: rank === 0 ? 0.2 : 0.6 }],
                  })),
                ),
              },
              trtllm_num_requests_running: {
                series: prefillUrls.map((url) => buildTrtllmSeries(url, 'prefill', 2, 'avg')),
              },
            },
          }),
        ),
      ),
      { framework: 'dynamo-trt', disagg: true },
    );

    expect(result?.metricSources).toHaveLength(3);
    expect(result?.kvCacheUsageByEngine).toHaveLength(5);
    expect(result?.kvCacheUsage[0]?.value).toBeCloseTo(0.48);
    for (const url of prefillUrls) {
      const source = result?.metricSources.find((s) => s.source.endpointUrl === url);
      expect(source?.source.dpRank).toBeNull();
      expect(source?.kvCacheUsage).toEqual([{ t: 0, value: 0.4 }]);
      expect(source?.kvCacheUsageByEngine).toEqual([
        { engineLabel: '0', points: [{ t: 0, value: 0.2 }] },
        { engineLabel: '1', points: [{ t: 0, value: 0.6 }] },
      ]);
      expect(source?.queueDepth).toEqual([{ t: 0, running: 2, waiting: 0, total: 2 }]);
    }
    expect(result?.metricSources.find((s) => s.source.role === 'decode')?.kvCacheUsage).toEqual([
      { t: 0, value: 0.8 },
    ]);
  });
});

function rateSeriesFor(
  endpoint_url: string,
  labels: Record<string, string>,
  startNs: number,
  rates: number[],
) {
  return {
    endpoint_url,
    labels,
    timeslices: rates.map((rate, i) => ({
      start_ns: startNs + i * 1e9,
      end_ns: startNs + (i + 1) * 1e9,
      rate,
    })),
  };
}

function rateBlob(metricName: string, series: unknown[]) {
  return gzipSync(Buffer.from(JSON.stringify({ metrics: { [metricName]: { series } } })));
}

function total(points: { value: number }[] | undefined): number {
  return (points ?? []).reduce((a, p) => a + p.value, 0);
}

function workerSeries(
  endpoint_url: string,
  dynamo_component: 'prefill' | 'backend',
  worker_id: string,
  subLabel: 'dp_rank' | 'engine',
  subValues: string[],
  value: number,
  field: 'rate' | 'avg' = 'rate',
) {
  return subValues.map((v) => ({
    endpoint_url,
    labels: { dynamo_component, worker_id, [subLabel]: v },
    timeslices: [{ start_ns: 0, end_ns: 1e9, [field]: value }],
  }));
}

function dynamoBlob(series: unknown[]) {
  return gzipSync(
    Buffer.from(
      JSON.stringify({
        metrics: {
          'vllm:prompt_tokens': { series },
        },
      }),
    ),
  );
}

describe('metric source identity', () => {
  it("collapses a worker's sglang dp_rank series into one source", async () => {
    const cs = await computeChartSeries(
      dynamoBlob([
        ...workerSeries(
          'http://10.0.0.1:7500/metrics',
          'prefill',
          'w-pre',
          'dp_rank',
          ['0', '1', '2', '3'],
          25,
        ),
        ...workerSeries(
          'http://10.0.0.2:7502/metrics',
          'backend',
          'w-dec',
          'dp_rank',
          ['0', '1', '2', '3'],
          10,
        ),
      ]),
      { framework: 'dynamo-sglang', disagg: true },
    );
    expect(cs?.metricSources.map(({ source: s }) => [s.role, s.workerId])).toEqual([
      ['prefill', 'w-pre'],
      ['decode', 'w-dec'],
    ]);
    const prefill = cs?.metricSources.find(({ source: s }) => s.workerId === 'w-pre');
    expect(prefill?.promptTps).toEqual([{ t: 0, value: 100 }]);
  });

  it("collapses a worker's vllm engine series into one source", async () => {
    const cs = await computeChartSeries(
      dynamoBlob([
        ...workerSeries(
          'http://10.0.0.1:7500/metrics',
          'prefill',
          'w-pre',
          'engine',
          ['0', '1', '2', '3'],
          25,
        ),
      ]),
      { framework: 'dynamo-vllm', disagg: true },
    );
    expect(cs?.metricSources).toHaveLength(1);
    expect(cs?.metricSources[0]!.source.workerId).toBe('w-pre');
    expect(cs?.metricSources[0]!.promptTps).toEqual([{ t: 0, value: 100 }]);
  });

  it('keeps a worker whole when it also emits an unlabelled aggregate series', async () => {
    const cs = await computeChartSeries(
      dynamoBlob([
        {
          endpoint_url: 'http://10.0.0.1:7500/metrics',
          labels: { dynamo_component: 'prefill', worker_id: 'w-pre' },
          timeslices: [{ start_ns: 0, end_ns: 1e9, rate: 7 }],
        },
        ...workerSeries(
          'http://10.0.0.1:7500/metrics',
          'prefill',
          'w-pre',
          'dp_rank',
          ['0', '1'],
          25,
        ),
      ]),
      { framework: 'dynamo-sglang', disagg: true },
    );
    expect(cs?.metricSources).toHaveLength(1);
    expect(cs?.metricSources[0]!.source.dpRank).toBeNull();
    expect(cs?.metricSources[0]!.source.engine).toBeNull();
  });

  it('keeps distinct workers apart even when their ranks collide', async () => {
    const cs = await computeChartSeries(
      dynamoBlob([
        ...workerSeries('http://10.0.0.1:7500/metrics', 'prefill', 'w-a', 'dp_rank', ['0'], 5),
        ...workerSeries('http://10.0.0.2:7500/metrics', 'prefill', 'w-b', 'dp_rank', ['0'], 5),
        ...workerSeries('http://10.0.0.3:7500/metrics', 'prefill', 'w-c', 'dp_rank', ['0'], 5),
      ]),
      { framework: 'dynamo-vllm', disagg: true },
    );
    expect(cs?.metricSources.map(({ source: s }) => s.workerId)).toEqual(['w-a', 'w-b', 'w-c']);
  });
});

describe('computeChartSeries summed series', () => {
  it('sums components scraped on offset grids instead of emitting a comb', async () => {
    const cs = await computeChartSeries(
      rateBlob('vllm:prompt_tokens', [
        rateSeriesFor('http://a:8000/metrics', { worker_id: 'a' }, 0, [100, 100, 100]),
        rateSeriesFor('http://b:8000/metrics', { worker_id: 'b' }, 0.016e9, [20, 20, 20]),
      ]),
    );
    expect(cs?.prefillTps).toEqual([
      { t: 0, value: 100 },
      { t: 1, value: 120 },
      { t: 2, value: 120 },
    ]);
  });

  it('ignores a label split that reports nothing rather than halving the rate', async () => {
    const cs = await computeChartSeries(
      rateBlob('sglang:generation_tokens', [
        rateSeriesFor('http://a:8000/metrics', { is_streaming: 'false' }, 0, [0, 0, 0, 0]),
        rateSeriesFor('http://a:8000/metrics', { is_streaming: 'true' }, 0.016e9, [80, 90, 70, 60]),
      ]),
    );
    expect(cs?.decodeTps.map((p) => p.value)).toEqual([0, 80, 90, 70]);
  });

  it('preserves the token total, which the cumulative charts read as a sum', async () => {
    const rates = [10, 40, 0, 25, 5];
    const aligned = await computeChartSeries(
      rateBlob('vllm:prompt_tokens', [
        rateSeriesFor('http://a:8000/metrics', { worker_id: 'a' }, 0, rates),
        rateSeriesFor('http://b:8000/metrics', { worker_id: 'b' }, 0, rates),
      ]),
    );
    expect(total(aligned?.prefillTps)).toBe(160);
    expect(aligned?.prefillTps.map((p) => p.t)).toEqual([0, 1, 2, 3, 4]);

    const offset = await computeChartSeries(
      rateBlob('vllm:prompt_tokens', [
        rateSeriesFor('http://a:8000/metrics', { worker_id: 'a' }, 0, rates),
        rateSeriesFor('http://b:8000/metrics', { worker_id: 'b' }, 0.4e9, rates),
      ]),
    );
    expect(total(offset?.prefillTps)).toBe(155);
    expect(offset?.prefillTps.map((p) => p.t)).toEqual([0, 1, 2, 3, 4]);
  });

  it('counts mirrored API-server frontends once, not twice', async () => {
    const cs = await computeChartSeries(
      rateBlob('vllm:prompt_tokens', [
        rateSeriesFor('http://localhost:8888/metrics', { engine: '0' }, 0, [500, 500, 500]),
        rateSeriesFor('http://localhost:8889/metrics', { engine: '0' }, 0.019e9, [500, 500, 500]),
      ]),
    );
    expect(cs?.prefillTps.map((p) => p.value)).toEqual([500, 500, 500]);
  });

  it('keeps endpoints that disagree, which are engines rather than mirrors', async () => {
    const cs = await computeChartSeries(
      rateBlob('vllm:prompt_tokens', [
        rateSeriesFor('http://localhost:8888/metrics', { engine: '0' }, 0, [100, 100, 100]),
        rateSeriesFor('http://localhost:8889/metrics', { engine: '0' }, 0, [900, 900, 900]),
      ]),
    );
    expect(cs?.prefillTps.map((p) => p.value)).toEqual([1000, 1000, 1000]);
  });

  it('puts divided metrics on one lattice so the hit rate survives', async () => {
    const cs = await computeChartSeries(
      gzipSync(
        Buffer.from(
          JSON.stringify({
            metrics: {
              'vllm:prefix_cache_hits': {
                series: [
                  rateSeriesFor('http://a:8000/metrics', { engine: '0' }, 0.18e9, [75, 75]),
                  rateSeriesFor('http://a:8000/metrics', { engine: '1' }, 0.34e9, [75, 75]),
                ],
              },
              'vllm:prefix_cache_queries': {
                series: [
                  rateSeriesFor('http://a:8000/metrics', { engine: '0' }, 0, [100, 100]),
                  rateSeriesFor('http://a:8000/metrics', { engine: '1' }, 0.5e9, [100, 100]),
                ],
              },
            },
          }),
        ),
      ),
    );
    expect(cs?.prefixCacheHitRate.length).toBeGreaterThan(0);
    for (const point of cs!.prefixCacheHitRate) {
      expect(Number.isInteger(point.t)).toBe(true);
      expect(point.value).toBeCloseTo(0.75, 5);
    }
  });

  it('sums queue depth across workers on their own scrape offsets', async () => {
    const json = JSON.stringify({
      metrics: {
        'vllm:num_requests_running': {
          series: [0, 1, 2, 3].map((w) => ({
            endpoint_url: `http://10.0.0.${w}:7500/metrics`,
            labels: { worker_id: `w${w}` },
            timeslices: [
              { start_ns: w * 0.01e9, end_ns: w * 0.01e9 + 1e9, avg: 2 },
              { start_ns: w * 0.01e9 + 1e9, end_ns: w * 0.01e9 + 2e9, avg: 2 },
            ],
          })),
        },
        'vllm:num_requests_waiting': {
          series: [0, 1, 2, 3].map((w) => ({
            endpoint_url: `http://10.0.0.${w}:7500/metrics`,
            labels: { worker_id: `w${w}` },
            timeslices: [
              { start_ns: w * 0.01e9, end_ns: w * 0.01e9 + 1e9, avg: 1 },
              { start_ns: w * 0.01e9 + 1e9, end_ns: w * 0.01e9 + 2e9, avg: 1 },
            ],
          })),
        },
      },
    });
    const cs = await computeChartSeries(gzipSync(Buffer.from(json)));
    expect(cs?.queueDepth.at(-1)).toEqual({ t: 1, running: 8, waiting: 4, total: 12 });
  });

  it('leaves a single-component metric on a plain one-per-tick grid', async () => {
    const cs = await computeChartSeries(
      rateBlob('vllm:generation_tokens', [
        rateSeriesFor('http://a:8000/metrics', { engine: '0' }, 0, [10, 20, 30]),
      ]),
    );
    expect(cs?.decodeTps).toEqual([
      { t: 0, value: 10 },
      { t: 1, value: 20 },
      { t: 2, value: 30 },
    ]);
  });
});
