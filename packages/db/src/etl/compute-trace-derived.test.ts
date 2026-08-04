import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { computeAggregateStats } from './compute-aggregate-stats.js';
import { computeChartSeries } from './compute-chart-series.js';
import { computeRequestTimeline } from './compute-request-timeline.js';
import { computeTraceDerivedPayloads } from './compute-trace-derived.js';

function makeProfileBlob(): Buffer {
  return gzipSync(
    Buffer.from(
      [
        {
          metadata: {
            conversation_id: 'conv-1',
            turn_index: 0,
            worker_id: 'worker-1',
            agent_depth: 0,
            benchmark_phase: 'profiling',
            credit_issued_ns: 1_000,
            request_start_ns: 2_000,
            request_end_ns: 5_000,
          },
          metrics: {
            input_sequence_length: { value: 128, unit: 'tokens' },
            output_sequence_length: { value: 64, unit: 'tokens' },
            time_to_first_token: { value: 20, unit: 'ms' },
            inter_token_latency: { value: 5, unit: 'ms' },
          },
        },
        {
          metadata: {
            conversation_id: 'conv-1',
            turn_index: 1,
            worker_id: 'worker-1',
            agent_depth: 0,
            benchmark_phase: 'profiling',
            credit_issued_ns: 6_000,
            request_start_ns: 7_000,
            request_end_ns: 10_000,
          },
          metrics: {
            input_sequence_length: { value: 256, unit: 'tokens' },
            output_sequence_length: { value: 32, unit: 'tokens' },
            time_to_first_token: { value: 30, unit: 'ms' },
            inter_token_latency: { value: 6, unit: 'ms' },
          },
        },
      ]
        .map((record) => JSON.stringify(record))
        .join('\n'),
    ),
  );
}

function metric(
  values: { start_ns: number; end_ns: number; avg?: number; rate?: number }[],
  labels: Record<string, string> = {},
) {
  return { series: [{ endpoint_url: 'worker.test:8000', labels, timeslices: values }] };
}

function makeServerBlob(): Buffer {
  return gzipSync(
    Buffer.from(
      JSON.stringify({
        warmup_metrics: {
          'vllm:kv_cache_usage_perc': metric([{ start_ns: 0, end_ns: 1e9, avg: 0.1 }]),
          'vllm:prompt_tokens': metric([{ start_ns: 0, end_ns: 1e9, rate: 100 }]),
        },
        metrics: {
          'vllm:kv_cache_usage_perc': metric([
            { start_ns: 10e9, end_ns: 11e9, avg: 0.4 },
            { start_ns: 11e9, end_ns: 12e9, avg: 0.6 },
          ]),
          'vllm:prefix_cache_hits': metric([{ start_ns: 10e9, end_ns: 11e9, rate: 80 }]),
          'vllm:prefix_cache_queries': metric([{ start_ns: 10e9, end_ns: 11e9, rate: 100 }]),
          'vllm:gpu_prefix_cache_hits': metric([{ start_ns: 10e9, end_ns: 11e9, rate: 80 }]),
          'vllm:gpu_prefix_cache_queries': metric([{ start_ns: 10e9, end_ns: 11e9, rate: 100 }]),
          'vllm:num_requests_running': metric([{ start_ns: 10e9, end_ns: 11e9, avg: 3 }]),
          'vllm:num_requests_waiting': metric([{ start_ns: 10e9, end_ns: 11e9, avg: 2 }]),
          'vllm:prompt_tokens': metric([{ start_ns: 10e9, end_ns: 11e9, rate: 900 }]),
          'vllm:generation_tokens': metric([{ start_ns: 10e9, end_ns: 11e9, rate: 450 }]),
        },
      }),
    ),
  );
}

describe('computeTraceDerivedPayloads', () => {
  it('is byte-for-byte JSON equivalent to the independent upload computations', async () => {
    const profileBlob = makeProfileBlob();
    const serverBlob = makeServerBlob();
    const context = { framework: 'dynamo-vllm', disagg: true } as const;

    const [aggregateStats, chartSeries, requestTimeline] = await Promise.all([
      computeAggregateStats({ profileBlob, serverBlob }),
      computeChartSeries(serverBlob, context),
      Promise.resolve(computeRequestTimeline(profileBlob)),
    ]);
    const optimized = await computeTraceDerivedPayloads(profileBlob, serverBlob, context);

    expect(Buffer.from(JSON.stringify(optimized.aggregateStats))).toEqual(
      Buffer.from(JSON.stringify(aggregateStats)),
    );
    expect(Buffer.from(JSON.stringify(optimized.chartSeries))).toEqual(
      Buffer.from(JSON.stringify(chartSeries)),
    );
    expect(Buffer.from(JSON.stringify(optimized.requestTimeline))).toEqual(
      Buffer.from(JSON.stringify(requestTimeline)),
    );
  });

  it('produces the same payloads through the oversized streaming path', async () => {
    const profileBlob = makeProfileBlob();
    const serverBlob = makeServerBlob();
    const bounded = await computeTraceDerivedPayloads(profileBlob, serverBlob);
    const streamed = await computeTraceDerivedPayloads(
      profileBlob,
      serverBlob,
      {},
      {
        maxInMemoryBytes: 1,
      },
    );

    expect(streamed).toEqual(bounded);
  });

  it('preserves independent malformed-input fallbacks', async () => {
    const profileBlob = makeProfileBlob();
    const malformedServer = Buffer.from('not-gzip');
    const optimized = await computeTraceDerivedPayloads(profileBlob, malformedServer);

    expect(optimized.aggregateStats).toEqual(
      await computeAggregateStats({ profileBlob, serverBlob: malformedServer }),
    );
    expect(optimized.chartSeries).toBeNull();
    expect(optimized.requestTimeline).toEqual(computeRequestTimeline(profileBlob));
  });
});
