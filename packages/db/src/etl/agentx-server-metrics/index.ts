/**
 * AgentX server-side metrics, derived by the app from raw artifacts only:
 * the AIPerf scrape summary (`server_metrics_export.csv`) and the stored
 * server-log bundle. Values an older producer computed into the aggregate are
 * ignored. Anything that cannot be derived correctly is null, never guessed.
 *
 * Engine specifics live in one parser per inference server (see `types.ts`);
 * this module owns everything shared: worker and role identification from log
 * file names, per-role scrape filtering, and the disaggregated headline.
 */

import { atom } from './atom';
import {
  fraction,
  gaugeStat,
  parseScrapeCsv,
  sumStat,
  type Scrape,
  type ScrapeSeries,
} from './scrape';
import { sglang } from './sglang';
import { trtllm } from './trtllm';
import type { ConfigParams } from '../config-cache';
import type { EngineParser, RoleTopology } from './types';
import { vllm } from './vllm';

/** Canonical framework → server parser. */
export const ENGINE_PARSERS: Readonly<Record<string, EngineParser>> = {
  vllm,
  tilert: vllm,
  'dynamo-vllm': vllm,
  sglang,
  'dynamo-sglang': sglang,
  'mori-sglang': sglang,
  trt: trtllm,
  'dynamo-trt': trtllm,
  atom,
  'mooncake-atom': atom,
};

/** Metric keys this module owns on AgentX rows; producer values for them are discarded. */
export const AGENTX_SERVER_METRIC_KEYS = [
  'kv_cache_pool_tokens',
  'kv_cache_pool_prefill_tokens',
  'kv_cache_pool_decode_tokens',
  'server_gpu_cache_hit_rate',
  'server_cpu_cache_hit_rate',
  'server_external_cache_hit_rate',
  'gpu_kv_cache_usage_pct',
  'total_prompt_tokens',
  'total_generation_tokens',
] as const;
export type AgentxServerMetricKey = (typeof AGENTX_SERVER_METRIC_KEYS)[number];

type Role = 'agg' | 'prefill' | 'decode';

export interface RoleConfig {
  tp: number;
  dpAttention: boolean;
  numWorkers: number;
}

export interface LogFileLines {
  fileName: string;
  lines: readonly string[];
}

export interface AgentxServerMetricsInput {
  framework: string;
  disagg: boolean;
  prefill: RoleConfig;
  decode: RoleConfig;
  /** `server_metrics_export.csv`, or null when the point has no scrape. */
  scrapeCsv: string | null;
  /** Startup lines of the stored server-log files, or null when no bundle is stored. */
  logFiles: readonly LogFileLines[] | null;
  /** Client-side totals used when the scrape has no token counters. */
  clientTokens: { prompt: number | null; generation: number | null };
}

export interface AgentxServerMetrics {
  metrics: Record<AgentxServerMetricKey, number | null>;
  /** Why `kv_cache_pool_tokens` is null. */
  kvPoolReason: string | null;
}

/** Worker logs: srt-slurm `<host>_<role>_w<N>.out`, AMD `<role>[N]_<host>.log`, single-node `server.log`. */
export function workerOfLogFile(fileName: string): { role: Role; worker: string } | null {
  const base = fileName.slice(fileName.lastIndexOf('/') + 1);
  const srt = /_(?<role>prefill|decode|agg)_w(?<n>\d+)\.out$/u.exec(base);
  if (srt) return { role: srt.groups!.role as Role, worker: srt.groups!.n! };
  const amd = /^(?<role>prefill|decode)(?<n>\d*)_[^/]+\.log$/u.exec(base);
  if (amd) return { role: amd.groups!.role as Role, worker: amd.groups!.n || '0' };
  return base === 'server.log' ? { role: 'agg', worker: '0' } : null;
}

/** Dynamo and TRT-LLM label each worker endpoint's series with its disaggregated role. */
function seriesRole(labels: Record<string, string>): Role | null {
  const label = (labels.dynamo_component ?? labels.disaggregation_mode ?? '').toLowerCase();
  if (['prefill', 'context', 'ctx'].includes(label)) return 'prefill';
  if (['backend', 'decode', 'generation', 'gen'].includes(label)) return 'decode';
  return null;
}

function roleScrape(scrape: Scrape, role: Role): Scrape {
  if (role === 'agg') return scrape;
  const filtered = new Map<string, ScrapeSeries[]>();
  for (const [name, series] of scrape) {
    const kept = series.filter((s) => seriesRole(s.labels) === role);
    if (kept.length > 0) filtered.set(name, kept);
  }
  return filtered;
}

/**
 * Regex selecting the startup lines and argument tokens a framework's pool
 * parser reads (capture group 1 = line, 2 = token). Lines must be complete:
 * they start after a newline (or at the text start) and end before one, so
 * scanning a log in overlapping slices never yields a truncated line. Valid in
 * PostgreSQL and JavaScript.
 */
export function startupLinePattern(framework: string, atTextStart: boolean): string | null {
  const parser = ENGINE_PARSERS[framework];
  if (!parser) return null;
  const parts: string[] = [];
  if (parser.logLines.length > 0) {
    const start = atTextStart ? String.raw`(?:^|\n)` : String.raw`\n`;
    parts.push(String.raw`${start}([^\n]{0,255}(?:${parser.logLines.join('|')})[^\n]*)(?=\n)`);
  }
  if (parser.logTokens.length > 0) {
    parts.push(String.raw`[^A-Za-z0-9_]((?:${parser.logTokens.join('|')})=[0-9]+)(?=[^0-9])`);
  }
  return parts.length > 0 ? parts.join('|') : null;
}

/** In-memory equivalent of the SQL extraction, for one whole log text. */
export function extractStartupLines(text: string, framework: string): string[] {
  const pattern = startupLinePattern(framework, true);
  if (!pattern) return [];
  return [...`${text}\n`.matchAll(new RegExp(pattern, 'gu'))].map((m) => m[1] ?? m[2]!);
}

function rolePool(
  parser: EngineParser,
  input: AgentxServerMetricsInput,
  scrape: Scrape,
  role: Role,
): number | string {
  const config = role === 'prefill' ? input.prefill : input.decode;
  const topology: RoleTopology = {
    tp: config.tp,
    dpAttention: config.dpAttention,
    // Aggregated configs may count DP ranks as workers; only disaggregated roles pin worker logs.
    workers: role === 'agg' ? null : config.numWorkers,
  };
  const workers = new Map<string, string[]>();
  for (const file of input.logFiles ?? []) {
    const worker = workerOfLogFile(file.fileName);
    if (worker?.role !== role) continue;
    workers.set(worker.worker, [...(workers.get(worker.worker) ?? []), ...file.lines]);
  }
  const pool = parser.rolePool({
    workers: [...workers.values()],
    scrape: roleScrape(scrape, role),
    topology,
  });
  return typeof pool === 'number' ? pool : `${role}: ${pool}`;
}

/** Assemble the derivation input from a canonical config and the row's mapped metrics. */
export function agentxServerMetricsInput(
  config: Pick<
    ConfigParams,
    | 'framework'
    | 'disagg'
    | 'prefillTp'
    | 'prefillDpAttn'
    | 'prefillNumWorkers'
    | 'decodeTp'
    | 'decodeDpAttn'
    | 'decodeNumWorkers'
  >,
  metrics: Readonly<Record<string, unknown>>,
  raw: Pick<AgentxServerMetricsInput, 'scrapeCsv' | 'logFiles'>,
): AgentxServerMetricsInput {
  const value = (key: string): number | null => {
    const n = metrics[key];
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  };
  const requests = value('total_requests_completed');
  const total = (mean: number | null): number | null =>
    mean === null || requests === null ? null : mean * requests;
  return {
    framework: config.framework,
    disagg: config.disagg,
    prefill: {
      tp: config.prefillTp,
      dpAttention: config.prefillDpAttn,
      numWorkers: config.prefillNumWorkers,
    },
    decode: {
      tp: config.decodeTp,
      dpAttention: config.decodeDpAttn,
      numWorkers: config.decodeNumWorkers,
    },
    ...raw,
    clientTokens: {
      prompt: total(value('mean_input_tokens')),
      generation: total(value('mean_output_tokens_actual')),
    },
  };
}

export function deriveAgentxServerMetrics(input: AgentxServerMetricsInput): AgentxServerMetrics {
  const parser = ENGINE_PARSERS[input.framework];
  const scrape: Scrape = input.scrapeCsv ? parseScrapeCsv(input.scrapeCsv) : new Map();
  const whole = parser?.scrape(scrape);
  // Prefix-cache hits happen on prefill workers. Decode workers' counters would
  // dilute them, and vLLM decode counts KV received from prefill as external tokens.
  const prefillScrape = input.disagg ? roleScrape(scrape, 'prefill') : scrape;
  const hits = prefillScrape.size > 0 ? parser?.scrape(prefillScrape) : whole;
  // The Dynamo frontend counts each request once; engine counters count a
  // disaggregated request on both roles, so they are only used when aggregated.
  const tokens = (frontend: string, engine: number | null | undefined, client: number | null) =>
    roundOrNull(sumStat(scrape, frontend) ?? (input.disagg ? null : engine) ?? client);
  const metrics: Record<AgentxServerMetricKey, number | null> = {
    kv_cache_pool_tokens: null,
    kv_cache_pool_prefill_tokens: null,
    kv_cache_pool_decode_tokens: null,
    server_gpu_cache_hit_rate: hitRate(hits?.gpuCacheHitRate),
    server_cpu_cache_hit_rate: hitRate(hits?.cpuCacheHitRate),
    server_external_cache_hit_rate: hitRate(hits?.externalCacheHitRate),
    gpu_kv_cache_usage_pct:
      whole?.gpuKvCacheUsage ??
      fraction(gaugeStat(scrape, 'dynamo_component_gpu_cache_usage_percent')),
    total_prompt_tokens: tokens(
      'dynamo_frontend_input_sequence_tokens',
      whole?.promptTokens,
      input.clientTokens.prompt,
    ),
    total_generation_tokens: tokens(
      'dynamo_frontend_output_tokens',
      whole?.generationTokens,
      input.clientTokens.generation,
    ),
  };

  if (!parser) return { metrics, kvPoolReason: `unsupported framework ${input.framework}` };
  if (input.logFiles === null && parser.logLines.length > 0) {
    return { metrics, kvPoolReason: 'no server log stored' };
  }
  if (!input.disagg) {
    const pool = rolePool(parser, input, scrape, 'agg');
    metrics.kv_cache_pool_tokens = typeof pool === 'number' ? pool : null;
    return { metrics, kvPoolReason: typeof pool === 'number' ? null : pool };
  }
  // Disaggregated: requests' KV lives in the decode pool after prefill, so the
  // decode pool is the working-set ceiling; both role pools are kept.
  const prefill = rolePool(parser, input, scrape, 'prefill');
  const decode = rolePool(parser, input, scrape, 'decode');
  metrics.kv_cache_pool_prefill_tokens = typeof prefill === 'number' ? prefill : null;
  metrics.kv_cache_pool_decode_tokens = typeof decode === 'number' ? decode : null;
  metrics.kv_cache_pool_tokens = metrics.kv_cache_pool_decode_tokens;
  return { metrics, kvPoolReason: typeof decode === 'number' ? null : decode };
}

/** A ratio above 1 means the hit and query counters' windows do not line up. */
function hitRate(value: number | null | undefined): number | null {
  return value === undefined || value === null || value > 1 ? null : value;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}
