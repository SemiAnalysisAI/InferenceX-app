import { parseNum } from './normalizers';

const V3_STAT_KEYS: Record<string, string> = {
  mean: 'mean',
  p50: 'median',
  median: 'median',
  p75: 'p75',
  p90: 'p90',
  p95: 'p95',
  p99: 'p99',
  'p99.9': 'p99.9',
  std: 'std',
};

const V3_LATENCY_METRICS: Record<string, string> = {
  ttft: 'ttft',
  e2el: 'e2el',
  itl: 'itl',
  tpot: 'tpot',
  intvty: 'intvty',
  full_response_itl: 'full_response_itl',
  full_response_intvty: 'full_response_intvty',
  e2e_norm_intvty: 'e2e_norm_intvty',
};

const V3_TOKEN_METRICS: Record<string, string> = {
  input: 'input_tokens',
  output_actual: 'output_tokens_actual',
  output_expected: 'output_tokens_expected',
};

const V3_SCALAR_PATHS: [string[], string][] = [
  [['request_metrics', 'throughput', 'input', 'tokens_per_second'], 'input_tput_tps'],
  [['request_metrics', 'throughput', 'output', 'tokens_per_second'], 'output_tput_tps'],
  [['request_metrics', 'throughput', 'total', 'tokens_per_second'], 'total_tput_tps'],
  [['request_metrics', 'throughput', 'duration_seconds'], 'duration_seconds'],
  [['request_metrics', 'throughput', 'per_gpu', 'total_tput_tps'], 'tput_per_gpu'],
  [['request_metrics', 'throughput', 'per_gpu', 'output_tput_tps'], 'output_tput_per_gpu'],
  [['request_metrics', 'throughput', 'per_gpu', 'input_tput_tps'], 'input_tput_per_gpu'],
  [['request_metrics', 'cache', 'theoretical_cache_hit_rate'], 'theoretical_cache_hit_rate'],
  [['server_metrics', 'cache', 'gpu_cache_hit_rate'], 'server_gpu_cache_hit_rate'],
  [['server_metrics', 'cache', 'cpu_cache_hit_rate'], 'server_cpu_cache_hit_rate'],
  [['server_metrics', 'cache', 'external_cache_hit_rate'], 'server_external_cache_hit_rate'],
  [['server_metrics', 'kv_cache', 'gpu_usage_pct'], 'gpu_kv_cache_usage_pct'],
  [['server_metrics', 'tokens', 'prompt_total'], 'total_prompt_tokens'],
  [['server_metrics', 'tokens', 'generation_total'], 'total_generation_tokens'],
  [['server_metrics', 'tokens', 'requests_completed'], 'total_requests_completed'],
];

function atPath(obj: Record<string, any>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function flattenStatBlock(block: unknown, suffix: string, out: Record<string, number>): void {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return;
  for (const [stat, canonical] of Object.entries(V3_STAT_KEYS)) {
    const n = parseNum((block as Record<string, unknown>)[stat]);
    if (n !== undefined) out[`${canonical}_${suffix}`] = n;
  }
}

export function flattenAgenticAggRow(row: Record<string, any>): Record<string, any> {
  const rm = row.request_metrics;
  if (!rm || typeof rm !== 'object' || Array.isArray(rm)) return row;

  const flat: Record<string, number> = {};

  for (const [metric, suffix] of Object.entries(V3_LATENCY_METRICS)) {
    flattenStatBlock(atPath(row, ['request_metrics', 'latency', metric]), suffix, flat);
  }
  flattenStatBlock(atPath(row, ['request_metrics', 'qps']), 'qps', flat);
  for (const [src, suffix] of Object.entries(V3_TOKEN_METRICS)) {
    flattenStatBlock(atPath(row, ['request_metrics', 'tokens', src]), suffix, flat);
  }
  for (const [path, key] of V3_SCALAR_PATHS) {
    const n = parseNum(atPath(row, path));
    if (n !== undefined) flat[key] = n;
  }

  return { ...row, ...flat };
}
