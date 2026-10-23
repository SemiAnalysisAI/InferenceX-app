import type { ConfigParams } from './config-cache';
import { resolveConfigTopology } from './topology';
import type { SkipTracker } from './skip-tracker';
import {
  CPU_SIDE_POWER_METRIC_KEYS,
  MEASURED_POWER_METRIC_KEYS,
  METRIC_KEYS,
  PRECISION_KEYS,
} from '@semianalysisai/inferencex-constants';
import { flattenAgenticAggRow } from './agentic-v3-flatten';
import { preferFullResponseMetrics } from './full-response-interactivity';
import {
  resolveModelKey,
  hwToGpuKey,
  normalizeFramework,
  normalizePrecision,
  normalizeSpecMethod,
  parseNum,
  parseInt2,
} from './normalizers';
import { normalizeLegacyTpuRow } from './tpu-normalization';
import { extractRuntimeMetadata } from './runtime-metadata';

export { flattenAgenticAggRow };

const NON_METRIC_KEYS = new Set([
  'hw',
  'model',
  'framework',
  'precision',
  'infmax_model_prefix',
  'isl',
  'osl',
  'conc',
  'image',
  'recipe_fingerprint',
  'run_attempt',
  'recipe-fingerprint',
  'disagg',
  'is_multinode',
  'spec_decoding',
  'tp',
  'ep',
  'dp_attention',
  'prefill_tp',
  'prefill_ep',
  'prefill_dp_attention',
  'prefill_num_workers',
  'decode_tp',
  'decode_ep',
  'decode_dp_attention',
  'decode_num_workers',
  'num_gpus',
  'num_prefill_gpu',
  'num_decode_gpu',
  'num_aggregate_gpu',
  'scenario_type',
  'users',
  'offload_mode',
  'num_requests_total',
  'num_requests_successful',
  'kv_offloading',
  'kv_offload_backend',
  'kv_p2p_transfer',
  'router',
  'request_metrics',
  'server_metrics',
  'dataset',
  'workers',
  'power_invalid_reasons',
  'power_audit',
  'benchmark_outcome',
]);

export type BenchmarkType = 'single_turn' | 'agentic_traces';

function descriptorToOnOff(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? (v === 'none' ? 'off' : 'on') : null;
}

const _warnedMetricKeys = new Set<string>();

export interface WorkerPower {
  role: string;
  worker_idx: number;
  hosts?: string[];
  num_gpus: number;
  avg_power_w: number;
  avg_temp_c?: number;
  peak_temp_c?: number;
  avg_util_pct?: number;
  avg_mem_used_mb?: number;
}

export interface PowerAudit {
  window_start_unix?: number;
  window_end_unix?: number;
  expected_gpu_count?: number;
  observed_gpu_count?: number;
  sample_count?: number;
  max_sample_gap_s?: number;
  producer_sha?: string | null;
  exporter_image_sha256?: string | null;
  source?: string;
  observed_gpu_ids?: string[];
  cpu?: PowerAuditCpu;
}

export const POWER_AUDIT_CPU_SENSOR_KINDS = ['module', 'grace_socket', 'dcgm_cpu_rail'] as const;

export interface PowerAuditCpu {
  sensor_kind?: (typeof POWER_AUDIT_CPU_SENSOR_KINDS)[number];
  source?: string;
  expected_sockets?: number;
  observed_sockets?: number;
  sample_row_count?: number;
  reason_codes?: string[];
}

export interface BenchmarkParams {
  config: ConfigParams;
  benchmarkType: BenchmarkType;
  isl: number | null;
  osl: number | null;
  conc: number;
  offloadMode: string;
  image: string | null;
  recipeFingerprint: string | null;
  metrics: Record<string, number>;
  workers?: WorkerPower[];
  powerInvalidReasons?: string[];
  powerAudit?: PowerAudit;
}

export function isAgenticRow(row: Record<string, unknown>): boolean {
  return String(row.scenario_type ?? '').startsWith('agentic');
}

export function mapBenchmarkRow(
  row: Record<string, any>,
  tracker: SkipTracker,
  islOslFallback?: { isl: number; osl: number } | null,
  runId?: string | number | null,
): BenchmarkParams | null {
  row = normalizeLegacyTpuRow(flattenAgenticAggRow(row), runId);
  if (row.benchmark_outcome?.status === 'failed') {
    tracker.skips.failedRun++;
    return null;
  }

  const modelKey = resolveModelKey(row);
  if (!modelKey) {
    tracker.skips.unmappedModel++;
    const raw = String(row.infmax_model_prefix ?? row.model ?? '');
    if (raw) tracker.unmappedModels.add(raw);
    return null;
  }

  const gpuKey = hwToGpuKey(String(row.hw ?? ''));
  if (!gpuKey) {
    tracker.skips.unmappedHw++;
    const raw = String(row.hw ?? '');
    if (raw) tracker.unmappedHws.add(raw);
    return null;
  }

  const isAgentic = isAgenticRow(row);
  const benchmarkType: BenchmarkType = isAgentic ? 'agentic_traces' : 'single_turn';

  const isl = isAgentic ? null : (parseInt2(row.isl) ?? islOslFallback?.isl ?? null);
  const osl = isAgentic ? null : (parseInt2(row.osl) ?? islOslFallback?.osl ?? null);
  const conc = isAgentic ? (parseInt2(row.users) ?? parseInt2(row.conc)) : parseInt2(row.conc);
  if (!conc || (!isAgentic && (!isl || !osl))) {
    tracker.skips.noIslOsl++;
    return null;
  }

  if (
    typeof row.num_requests_successful === 'number' &&
    row.num_requests_successful === 0 &&
    typeof row.num_requests_total === 'number'
  ) {
    tracker.skips.failedRun++;
    return null;
  }

  const offloadModeRaw =
    typeof row.offload_mode === 'string' && row.offload_mode.length > 0
      ? row.offload_mode
      : (descriptorToOnOff(row.kv_offloading) ?? descriptorToOnOff(row.offloading) ?? 'off');

  const { framework, disagg: frameworkDisagg } = normalizeFramework(
    String(row.framework ?? ''),
    row.disagg,
  );
  const precision = normalizePrecision(String(row.precision ?? ''));
  if (!PRECISION_KEYS.has(precision)) {
    tracker.unmappedPrecisions.add(precision);
  }
  const specMethod = normalizeSpecMethod(row.spec_decoding);

  const topology = resolveConfigTopology(row, framework, frameworkDisagg);
  let metrics = captureNumericMetrics(row);
  normalizePowerContractMetrics(row, metrics);
  if (isAgentic) metrics = preferFullResponseMetrics(metrics);
  if (!topology.disagg && (metrics.prefill_pp !== undefined || metrics.decode_pp !== undefined)) {
    const pp = Math.max(metrics.prefill_pp ?? 1, metrics.decode_pp ?? 1);
    metrics.prefill_pp = pp;
    metrics.decode_pp = pp;
  }

  if (isAgentic) {
    (metrics as Record<string, unknown>).offload_mode = offloadModeRaw;
  }
  Object.assign(metrics, extractRuntimeMetadata(row));

  if (isAgentic) {
    for (const k of ['mean', 'median', 'p75', 'p90', 'p95', 'p99', 'p99.9']) {
      const itl = metrics[`${k}_itl`];
      if (typeof itl === 'number' && itl > 0) {
        metrics[`${k}_intvty`] = 1 / itl;
      } else {
        delete metrics[`${k}_intvty`];
      }
    }
  }

  const image = row.image ? String(row.image).replaceAll('#', '/') : null;
  const rawRecipeFingerprint = row.recipe_fingerprint ?? row['recipe-fingerprint'];
  const recipeFingerprint =
    typeof rawRecipeFingerprint === 'string' && rawRecipeFingerprint.trim().length > 0
      ? rawRecipeFingerprint.trim()
      : null;

  const powerWithheld = scrubWithheldPowerMetrics(metrics);
  const workers = powerWithheld ? undefined : extractWorkers(row.workers);
  const powerInvalidReasons = extractPowerInvalidReasons(row.power_invalid_reasons);
  const powerAudit = extractPowerAudit(row.power_audit);

  return {
    config: {
      hardware: gpuKey,
      framework,
      model: modelKey,
      precision,
      specMethod,
      ...topology,
    },
    benchmarkType,
    isl,
    osl,
    conc,
    offloadMode: offloadModeRaw,
    image,
    recipeFingerprint,
    metrics,
    workers,
    powerInvalidReasons,
    powerAudit,
  };
}

function captureNumericMetrics(row: Record<string, any>): Record<string, number> {
  const metrics: Record<string, number> = {};
  for (const [rawKey, val] of Object.entries(row)) {
    if (NON_METRIC_KEYS.has(rawKey)) continue;
    const n = parseNum(val);
    if (n === undefined) continue;
    metrics[rawKey] = n;
    if (!METRIC_KEYS.has(rawKey) && !_warnedMetricKeys.has(rawKey)) {
      _warnedMetricKeys.add(rawKey);
      console.warn(
        `  [WARN] auto-captured unexpected metric '${rawKey}' — add to METRIC_KEYS in constants/src/metric-keys.ts or NON_METRIC_KEYS in benchmark-mapper.ts`,
      );
    }
  }
  return metrics;
}

export function normalizePowerContractMetrics(
  row: Record<string, any>,
  metrics: Record<string, number>,
): void {
  for (const field of ['power_valid', 'cpu_power_valid'] as const) {
    if (Object.hasOwn(row, field)) {
      const verdict = row[field];
      metrics[field] = verdict === 1 || verdict === '1' ? 1 : 0;
    } else {
      delete metrics[field];
    }
  }

  if (!Object.hasOwn(row, 'power_metric_schema_version')) {
    delete metrics.power_metric_schema_version;
    return;
  }

  const rawVersion = row.power_metric_schema_version;
  const version =
    typeof rawVersion === 'number'
      ? rawVersion
      : typeof rawVersion === 'string' && /^[1-9]\d*$/u.test(rawVersion)
        ? Number(rawVersion)
        : undefined;
  if (typeof version === 'number' && Number.isSafeInteger(version) && version > 0) {
    metrics.power_metric_schema_version = version;
  } else {
    delete metrics.power_metric_schema_version;
  }
}

export function scrubWithheldPowerMetrics(metrics: Record<string, number>): boolean {
  if (metrics.cpu_power_valid !== 1) {
    for (const key of CPU_SIDE_POWER_METRIC_KEYS) delete metrics[key];
  }
  if (metrics.power_valid !== 0) return false;
  for (const key of MEASURED_POWER_METRIC_KEYS) {
    if (!CPU_SIDE_POWER_METRIC_KEYS.has(key)) delete metrics[key];
  }
  return true;
}

export function extractWorkers(raw: unknown): WorkerPower[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: WorkerPower[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const role = typeof e.role === 'string' ? e.role : null;
    const worker_idx = parseInt2(e.worker_idx);
    const num_gpus = parseInt2(e.num_gpus);
    const avg_power_w = parseNum(e.avg_power_w);
    if (
      role === null ||
      worker_idx === undefined ||
      num_gpus === undefined ||
      avg_power_w === undefined
    )
      continue;

    const w: WorkerPower = { role, worker_idx, num_gpus, avg_power_w };
    if (Array.isArray(e.hosts) && e.hosts.every((h) => typeof h === 'string')) {
      w.hosts = e.hosts as string[];
    }
    const avg_temp_c = parseNum(e.avg_temp_c);
    if (avg_temp_c !== undefined) w.avg_temp_c = avg_temp_c;
    const peak_temp_c = parseNum(e.peak_temp_c);
    if (peak_temp_c !== undefined) w.peak_temp_c = peak_temp_c;
    const avg_util_pct = parseNum(e.avg_util_pct);
    if (avg_util_pct !== undefined) w.avg_util_pct = avg_util_pct;
    const avg_mem_used_mb = parseNum(e.avg_mem_used_mb);
    if (avg_mem_used_mb !== undefined) w.avg_mem_used_mb = avg_mem_used_mb;
    out.push(w);
  }
  return out.length > 0 ? out : undefined;
}

const POWER_REASON_CODE_RE = /^[a-z][a-z0-9_]*$/u;
const MAX_POWER_REASON_CODES = 32;
const MAX_POWER_REASON_LENGTH = 64;
const MAX_POWER_AUDIT_SHA_LENGTH = 128;

export function extractPowerInvalidReasons(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const code = entry.trim();
    if (code.length === 0 || code.length > MAX_POWER_REASON_LENGTH) continue;
    if (!POWER_REASON_CODE_RE.test(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= MAX_POWER_REASON_CODES) break;
  }
  return out.length > 0 ? out : undefined;
}

function auditFiniteNum(v: unknown): number | undefined {
  const n = parseNum(v);
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}

function auditCount(v: unknown): number | undefined {
  const n = parseInt2(v);
  return n !== undefined && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

function auditSha(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= MAX_POWER_AUDIT_SHA_LENGTH ? s : null;
}

function extractPowerAuditCpu(raw: unknown): PowerAuditCpu | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const e = raw as Record<string, unknown>;
  const cpu: PowerAuditCpu = {};
  if ((POWER_AUDIT_CPU_SENSOR_KINDS as readonly unknown[]).includes(e.sensor_kind)) {
    cpu.sensor_kind = e.sensor_kind as PowerAuditCpu['sensor_kind'];
  }
  if (typeof e.source === 'string' && e.source.length > 0 && e.source.length <= 32) {
    cpu.source = e.source;
  }
  for (const field of ['expected_sockets', 'observed_sockets', 'sample_row_count'] as const) {
    const n = auditCount(e[field]);
    if (n !== undefined) cpu[field] = n;
  }
  if (Array.isArray(e.reason_codes)) {
    cpu.reason_codes = extractPowerInvalidReasons(e.reason_codes) ?? [];
  }
  return Object.keys(cpu).length > 0 ? cpu : undefined;
}

export function extractPowerAudit(raw: unknown): PowerAudit | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const e = raw as Record<string, unknown>;
  const audit: PowerAudit = {};

  const window_start_unix = auditFiniteNum(e.window_start_unix);
  if (window_start_unix !== undefined) audit.window_start_unix = window_start_unix;
  const window_end_unix = auditFiniteNum(e.window_end_unix);
  if (window_end_unix !== undefined) audit.window_end_unix = window_end_unix;
  const max_sample_gap_s = auditFiniteNum(e.max_sample_gap_s);
  if (max_sample_gap_s !== undefined) audit.max_sample_gap_s = max_sample_gap_s;
  const expected_gpu_count = auditCount(e.expected_gpu_count);
  if (expected_gpu_count !== undefined) audit.expected_gpu_count = expected_gpu_count;
  const observed_gpu_count = auditCount(e.observed_gpu_count);
  if (observed_gpu_count !== undefined) audit.observed_gpu_count = observed_gpu_count;
  const sample_count = auditCount(e.sample_count);
  if (sample_count !== undefined) audit.sample_count = sample_count;
  if (
    typeof e.source === 'string' &&
    e.source.length <= 512 &&
    /^[a-zA-Z0-9_./-]+$/u.test(e.source) &&
    !e.source.startsWith('/') &&
    !e.source.split('/').includes('..')
  )
    audit.source = e.source;
  if (Array.isArray(e.observed_gpu_ids)) {
    const ids = e.observed_gpu_ids.filter(
      (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128,
    );
    if (ids.length > 0) audit.observed_gpu_ids = [...new Set(ids)].slice(0, 1024);
  }
  const cpu = extractPowerAuditCpu(e.cpu);
  if (cpu !== undefined) audit.cpu = cpu;
  const hasNumericField = Object.keys(audit).length > 0;

  audit.producer_sha = auditSha(e.producer_sha);
  audit.exporter_image_sha256 = auditSha(e.exporter_image_sha256);
  if (!hasNumericField && audit.producer_sha === null && audit.exporter_image_sha256 === null) {
    return undefined;
  }
  return audit;
}
