import { describe, expect, it } from 'vitest';

import {
  deriveAgentxServerMetrics,
  extractStartupLines,
  startupLinePattern,
  workerOfLogFile,
  type AgentxServerMetricsInput,
} from './index';
import { scrapeCsv } from './test-helpers';

const role = { tp: 8, dpAttention: false, numWorkers: 1 };
const base: AgentxServerMetricsInput = {
  framework: 'dynamo-sglang',
  disagg: true,
  prefill: role,
  decode: { ...role, numWorkers: 2 },
  scrapeCsv: null,
  logFiles: [],
  clientTokens: { prompt: null, generation: null },
};
const sgl = (tokens: number) => [`[TP0] max_total_num_tokens=${tokens}, context_len=1048576`];

const blocks = (endpoint: string, component: string, value: number) => [
  {
    type: 'gauge' as const,
    metric: 'trtllm_kv_cache_max_blocks',
    value,
    endpoint,
    labels: { dynamo_component: component },
  },
  {
    type: 'gauge' as const,
    metric: 'trtllm_kv_cache_tokens_per_block',
    value: 128,
    endpoint,
    labels: { dynamo_component: component },
  },
];

describe('workerOfLogFile', () => {
  it.each([
    [
      'multinode_server_logs/logs/im-gb300-r01-c002_prefill_w0.out',
      { role: 'prefill', worker: '0' },
    ],
    ['srt-single-node-logs/logs/worker-4_agg_w0.out', { role: 'agg', worker: '0' }],
    ['logs/vr-r41-cn06_decode_w12.out', { role: 'decode', worker: '12' }],
    ['prefill0_mia1-p01-g18.log', { role: 'prefill', worker: '0' }],
    ['decode_mia1-p01-g50.log', { role: 'decode', worker: '0' }],
    ['results/server.log', { role: 'agg', worker: '0' }],
    ['server_mia1-p01-g18.log', null],
    ['logs/im-gb300-r01-c001_frontend_0.out', null],
    ['benchmark.out', null],
  ])('%s', (fileName, expected) => {
    expect(workerOfLogFile(fileName)).toEqual(expected);
  });
});

describe('startup line extraction', () => {
  const log = [
    `progress ${'x'.repeat(50)}`,
    '[2026-08-20 DP0 TP0 EP0] max_total_num_tokens=218560, chunked_prefill_size=8192',
    'server_args=ServerArgs(tp_size=8, attn_dp_size=1, dp_size=8, enable_dp_attention=True)',
  ].join('\n');

  it('returns whole startup lines and argument tokens, not suffixed keys', () => {
    expect(extractStartupLines(log, 'sglang')).toEqual([
      '[2026-08-20 DP0 TP0 EP0] max_total_num_tokens=218560, chunked_prefill_size=8192',
      'dp_size=8',
    ]);
  });

  it('never matches a line truncated at the start or end of a scanned slice', () => {
    const pattern = new RegExp(startupLinePattern('sglang', false)!, 'gu');
    // A slice that begins mid-line, and one that ends mid-number, yield nothing.
    expect([...'P0 TP0 EP0] max_total_num_tokens=218560, x\n'.matchAll(pattern)]).toEqual([]);
    expect([...'\n[TP0] max_total_num_tokens=2185'.matchAll(pattern)]).toEqual([]);
  });
});

describe('deriveAgentxServerMetrics', () => {
  it('keeps both disaggregated role pools and uses decode as the headline', () => {
    const result = deriveAgentxServerMetrics({
      ...base,
      logFiles: [
        { fileName: 'logs/a_prefill_w0.out', lines: sgl(300) },
        { fileName: 'logs/b_decode_w0.out', lines: sgl(100) },
        { fileName: 'logs/c_decode_w1.out', lines: sgl(110) },
      ],
    });
    expect(result.metrics).toMatchObject({
      kv_cache_pool_tokens: 210,
      kv_cache_pool_prefill_tokens: 300,
      kv_cache_pool_decode_tokens: 210,
    });
    expect(result.kvPoolReason).toBeNull();
  });

  it('returns null with a reason when a role is missing worker logs', () => {
    const result = deriveAgentxServerMetrics({
      ...base,
      logFiles: [
        { fileName: 'logs/a_prefill_w0.out', lines: sgl(300) },
        { fileName: 'logs/b_decode_w0.out', lines: sgl(100) },
      ],
    });
    expect(result.metrics.kv_cache_pool_tokens).toBeNull();
    expect(result.metrics.kv_cache_pool_prefill_tokens).toBe(300);
    expect(result.kvPoolReason).toBe('decode: 1 of 2 worker logs');
  });

  it('reports aggregated pools without role fields', () => {
    const result = deriveAgentxServerMetrics({
      ...base,
      framework: 'sglang',
      disagg: false,
      logFiles: [{ fileName: 'results/server.log', lines: sgl(500) }],
    });
    expect(result.metrics.kv_cache_pool_tokens).toBe(500);
    expect(result.metrics.kv_cache_pool_decode_tokens).toBeNull();
  });

  it('distinguishes an unstored bundle from an unsupported framework', () => {
    expect(deriveAgentxServerMetrics({ ...base, logFiles: null }).kvPoolReason).toBe(
      'no server log stored',
    );
    expect(deriveAgentxServerMetrics({ ...base, framework: 'new-engine' }).kvPoolReason).toBe(
      'unsupported framework new-engine',
    );
  });

  it('counts disaggregated tokens once: Dynamo frontend, else client totals', () => {
    const engine = [
      {
        type: 'counter' as const,
        metric: 'sglang:prompt_tokens',
        value: 2000,
        endpoint: 'p:1',
        labels: { dynamo_component: 'prefill' },
      },
      {
        type: 'counter' as const,
        metric: 'sglang:prompt_tokens',
        value: 1900,
        endpoint: 'd:1',
        labels: { dynamo_component: 'backend' },
      },
    ];
    const frontend = {
      type: 'counter' as const,
      metric: 'dynamo_frontend_input_sequence_tokens',
      value: 1950,
    };
    const derive = (rows: Parameters<typeof scrapeCsv>[0], disagg = true) =>
      deriveAgentxServerMetrics({
        ...base,
        disagg,
        scrapeCsv: scrapeCsv(rows),
        clientTokens: { prompt: 1940, generation: null },
      }).metrics.total_prompt_tokens;
    expect(derive([...engine, frontend])).toBe(1950);
    expect(derive(engine)).toBe(1940);
    expect(derive(engine, false)).toBe(3900);
  });

  it('takes disaggregated hit rates from prefill workers only', () => {
    const result = deriveAgentxServerMetrics({
      ...base,
      scrapeCsv: scrapeCsv([
        {
          type: 'counter',
          metric: 'sglang:prompt_tokens',
          value: 1000,
          endpoint: 'p:1',
          labels: { dynamo_component: 'prefill', cache_source: '' },
        },
        {
          type: 'counter',
          metric: 'sglang:cached_tokens',
          value: 900,
          endpoint: 'p:1',
          labels: { dynamo_component: 'prefill', cache_source: 'device' },
        },
        {
          type: 'counter',
          metric: 'sglang:prompt_tokens',
          value: 1000,
          endpoint: 'd:1',
          labels: { dynamo_component: 'backend', cache_source: '' },
        },
        { type: 'gauge', metric: 'dynamo_component_gpu_cache_usage_percent', value: 0.4 },
      ]),
    });
    expect(result.metrics.server_gpu_cache_hit_rate).toBe(0.9);
    // Without an engine KV gauge, the Dynamo component gauge supplies KV usage.
    expect(result.metrics.gpu_kv_cache_usage_pct).toBe(0.4);
  });

  it('nulls a hit rate above 1 instead of reporting it', () => {
    const result = deriveAgentxServerMetrics({
      ...base,
      framework: 'sglang',
      disagg: false,
      scrapeCsv: scrapeCsv([
        {
          type: 'counter',
          metric: 'sglang:prompt_tokens',
          value: 1000,
          labels: { cache_source: '' },
        },
        {
          type: 'counter',
          metric: 'sglang:cached_tokens',
          value: 1010,
          labels: { cache_source: 'device' },
        },
      ]),
    });
    expect(result.metrics.server_gpu_cache_hit_rate).toBeNull();
    expect(result.metrics.total_prompt_tokens).toBe(1000);
  });

  it('falls back to client token totals only without server counters', () => {
    const result = deriveAgentxServerMetrics({
      ...base,
      clientTokens: { prompt: 1234.4, generation: 56.6 },
    });
    expect(result.metrics.total_prompt_tokens).toBe(1234);
    expect(result.metrics.total_generation_tokens).toBe(57);
  });

  it('filters a disaggregated role to its own scraped endpoints', () => {
    const result = deriveAgentxServerMetrics({
      ...base,
      framework: 'dynamo-trt',
      decode: { ...role, numWorkers: 1 },
      scrapeCsv: scrapeCsv([...blocks('p:1', 'prefill', 10), ...blocks('d:1', 'backend', 20)]),
    });
    expect(result.metrics.kv_cache_pool_prefill_tokens).toBe(1280);
    expect(result.metrics.kv_cache_pool_tokens).toBe(2560);
  });
});
