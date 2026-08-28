/**
 * Pure mapping helpers for assembling a normalized `GpuArtifactPower` block
 * from the power sidecar artifacts that share a `gpu_metrics_<X>` suffix:
 * the tiny `bmk_<X>` agg row and the `power_audit_<X>` validation bundle.
 * No fetching happens here — the /api/gpu-metrics route wires the downloads.
 */
import type { GpuArtifactPower, PowerWindow } from '@/components/gpu-power/types';

const GPU_METRICS_PREFIX = 'gpu_metrics_';

export interface SiblingArtifactNames {
  bmk: string;
  bmkAgentic: string;
  powerAudit: string;
}

/** Derive same-suffix sibling artifact names for a `gpu_metrics_<X>` artifact. */
export function siblingArtifactNames(gpuMetricsArtifactName: string): SiblingArtifactNames | null {
  if (!gpuMetricsArtifactName.startsWith(GPU_METRICS_PREFIX)) return null;
  const suffix = gpuMetricsArtifactName.slice(GPU_METRICS_PREFIX.length);
  if (suffix.length === 0) return null;
  return {
    bmk: `bmk_${suffix}`,
    bmkAgentic: `bmk_agentic_${suffix}`,
    powerAudit: `power_audit_${suffix}`,
  };
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Upper bound on plausible unix-second epochs (2100-01-01T00:00:00Z). Rejects
// ms-scale and garbage values, and keeps bound*1000 inside Date's ±8.64e15 ms
// representable range so the client can always ISO-format the window.
const MAX_UNIX_SECONDS = 4_102_444_800;

function windowFromUnixPair(start: unknown, end: unknown): PowerWindow | null {
  const startUnix = asFiniteNumber(start);
  const endUnix = asFiniteNumber(end);
  if (startUnix === null || endUnix === null) return null;
  if (startUnix <= 0 || endUnix <= 0) return null;
  if (startUnix > MAX_UNIX_SECONDS || endUnix > MAX_UNIX_SECONDS) return null;
  return { start_unix: startUnix, end_unix: endUnix };
}

/**
 * Map an `agg_<X>.json` row (the exact bytes the ETL ingests) to power fields.
 * Legacy rows yield published values + verdict only; rows carrying the PLAN-06
 * `power_audit` object additionally yield window bounds, counts, and provenance.
 */
export function powerFromAggRow(
  agg: Record<string, unknown>,
  source: 'bmk_artifact' | 'power_audit_agg' = 'bmk_artifact',
): Partial<GpuArtifactPower> {
  const result: Partial<GpuArtifactPower> = {};

  if ('power_valid' in agg && agg.power_valid !== null && agg.power_valid !== undefined) {
    result.power_valid = agg.power_valid === 1 || agg.power_valid === '1' ? 1 : 0;
  }

  const reasons = asStringArray(agg.power_invalid_reasons);
  if (reasons.length > 0) result.reasons = reasons;

  const avgPowerW = asFiniteNumber(agg.avg_power_w);
  const avgTotalGpuPowerW = asFiniteNumber(agg.avg_total_gpu_power_w);
  const schemaVersion = asFiniteNumber(agg.power_metric_schema_version);
  if (avgPowerW !== null || avgTotalGpuPowerW !== null || schemaVersion !== null) {
    result.published = {
      avg_power_w: avgPowerW,
      avg_total_gpu_power_w: avgTotalGpuPowerW,
      power_metric_schema_version: schemaVersion,
      source,
    };
  }

  const audit = asRecord(agg.power_audit);
  if (audit) {
    const window = windowFromUnixPair(audit.window_start_unix, audit.window_end_unix);
    if (window) result.window = window;
    const expected = asFiniteNumber(audit.expected_gpu_count);
    if (expected !== null) result.expected_gpu_count = expected;
    const observed = asFiniteNumber(audit.observed_gpu_count);
    if (observed !== null) result.observed_gpu_count = observed;
    const producerSha = asString(audit.producer_sha);
    if (producerSha) result.producer_sha = producerSha;
    const exporterSha = asString(audit.exporter_image_sha256);
    if (exporterSha) result.exporter_image_sha256 = exporterSha;
  }

  return result;
}

/**
 * Map a `power_validation_*.json` sidecar (single-node `benchmark_window` or
 * multinode `selected_window` + `producer`) to power fields.
 */
export function powerFromValidationSidecar(
  sidecar: Record<string, unknown>,
): Partial<GpuArtifactPower> {
  const result: Partial<GpuArtifactPower> = {};

  if (typeof sidecar.power_valid === 'boolean') {
    result.power_valid = sidecar.power_valid ? 1 : 0;
  } else if (sidecar.power_valid === 0 || sidecar.power_valid === 1) {
    result.power_valid = sidecar.power_valid;
  }

  const reasons = asStringArray(sidecar.reasons);
  if (reasons.length > 0) result.reasons = reasons;

  const benchmarkWindow = asRecord(sidecar.benchmark_window);
  const selectedWindow = asRecord(sidecar.selected_window);
  const window =
    (benchmarkWindow &&
      windowFromUnixPair(benchmarkWindow.start_time_unix, benchmarkWindow.end_time_unix)) ??
    (selectedWindow &&
      windowFromUnixPair(selectedWindow.start_time_unix, selectedWindow.end_time_unix)) ??
    null;
  if (window) result.window = window;

  const expected = asFiniteNumber(sidecar.expected_gpu_count);
  if (expected !== null) result.expected_gpu_count = expected;
  const observed = asFiniteNumber(sidecar.observed_gpu_count);
  if (observed !== null) result.observed_gpu_count = observed;

  const metrics = asRecord(sidecar.metrics);
  if (metrics) {
    const avgPowerW = asFiniteNumber(metrics.avg_power_w);
    const avgTotalGpuPowerW = asFiniteNumber(metrics.avg_total_gpu_power_w);
    if (avgPowerW !== null || avgTotalGpuPowerW !== null) {
      result.published = {
        avg_power_w: avgPowerW,
        avg_total_gpu_power_w: avgTotalGpuPowerW,
        // The sidecar's schema_version versions the sidecar itself, a
        // different axis than the agg row's power_metric_schema_version.
        power_metric_schema_version: null,
        source: 'validation_metrics',
      };
    }
  }

  const producer = asRecord(sidecar.producer);
  if (producer) {
    const producerSha = asString(producer.producer_git_commit);
    if (producerSha) result.producer_sha = producerSha;
    const exporterSha = asString(producer.exporter_image_sha256);
    if (exporterSha) result.exporter_image_sha256 = exporterSha;
  }

  return result;
}

/** Basename of a ZIP entry path (agentic bundles nest under `results/`). */
function entryBasename(entryName: string): string {
  const idx = entryName.lastIndexOf('/');
  return idx === -1 ? entryName : entryName.slice(idx + 1);
}

/** Filename stem: basename without its final extension. */
function pathStem(path: string): string {
  const base = entryBasename(path.replaceAll('\\', '/'));
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Pick the validation sidecar entry for `suffix` out of a `power_audit_*`
 * bundle. Multinode bundles can hold several `power_validation_*_*.json`
 * entries; keep the one whose `benchmark_result` stem equals the suffix,
 * otherwise keep a lone entry. Ambiguity yields null — never a guess.
 */
export function selectValidationEntry(
  entries: { entryName: string; json: Record<string, unknown> }[],
  suffix: string,
): Record<string, unknown> | null {
  const candidates = entries.filter((entry) =>
    entryBasename(entry.entryName).startsWith('power_validation'),
  );
  if (candidates.length === 0) return null;

  const exact = candidates.filter((entry) => {
    const benchmarkResult = asString(entry.json.benchmark_result);
    return benchmarkResult !== null && pathStem(benchmarkResult) === suffix;
  });
  if (exact.length === 1) return exact[0].json;
  if (candidates.length === 1) return candidates[0].json;
  return null;
}

/** True when a mapped partial carries at least one power field. */
export function hasPowerContent(
  partial: Partial<GpuArtifactPower> | null,
): partial is Partial<GpuArtifactPower> {
  return partial !== null && Object.keys(partial).length > 0;
}

/**
 * Merge the agg-row and sidecar mappings into the final normalized block.
 * The sidecar wins for window/reasons/counts (it is the audit source of
 * truth); the agg row wins for the published value (it is the exact row the
 * ETL ingests). Returns null when neither input carried anything.
 */
export function mergeArtifactPower(
  fromAgg: Partial<GpuArtifactPower> | null,
  fromSidecar: Partial<GpuArtifactPower> | null,
  sources: string[],
): GpuArtifactPower | null {
  if (!hasPowerContent(fromAgg) && !hasPowerContent(fromSidecar)) return null;
  const agg = fromAgg ?? {};
  const sidecar = fromSidecar ?? {};

  return {
    power_valid: sidecar.power_valid ?? agg.power_valid ?? null,
    reasons: sidecar.reasons ?? agg.reasons ?? [],
    window: sidecar.window ?? agg.window ?? null,
    expected_gpu_count: sidecar.expected_gpu_count ?? agg.expected_gpu_count ?? null,
    observed_gpu_count: sidecar.observed_gpu_count ?? agg.observed_gpu_count ?? null,
    published: agg.published ?? sidecar.published ?? null,
    producer_sha: agg.producer_sha ?? sidecar.producer_sha ?? null,
    exporter_image_sha256: agg.exporter_image_sha256 ?? sidecar.exporter_image_sha256 ?? null,
    sources,
  };
}
