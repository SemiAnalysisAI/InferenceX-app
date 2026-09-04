import { isDeepStrictEqual } from 'node:util';

import type { BenchmarkPointBackfill } from '../etl/run-overrides.js';

interface BackfillRow {
  offload_mode: unknown;
  metrics: unknown;
}

function asMetricsRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metricsPatch(backfill: BenchmarkPointBackfill): Record<string, unknown> {
  return {
    ...backfill.set.metricsMerge,
    ...(backfill.set.offloadMode === undefined ? {} : { offload_mode: backfill.set.offloadMode }),
  };
}

function isApplied(row: BackfillRow, backfill: BenchmarkPointBackfill): boolean {
  const desiredOffloadMode = backfill.set.offloadMode ?? backfill.offloadMode;
  if (row.offload_mode !== desiredOffloadMode) return false;
  const metrics = asMetricsRecord(row.metrics);
  if (!metrics) return false;
  return (
    Object.entries(metricsPatch(backfill)).every(([key, value]) =>
      isDeepStrictEqual(metrics[key], value),
    ) && (backfill.set.metricsRemove ?? []).every((key) => !Object.hasOwn(metrics, key))
  );
}

/** Recover only the exact JSONB array written by the original broken backfill. */
function recoverMalformedMetrics(
  value: unknown,
  backfill: BenchmarkPointBackfill,
): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const originalMetrics = asMetricsRecord(value[0]);
  if (!originalMetrics || typeof value[1] !== 'string') return null;
  try {
    if (!isDeepStrictEqual(JSON.parse(value[1]), metricsPatch(backfill))) return null;
  } catch {
    return null;
  }
  return originalMetrics;
}

/** The caller must first resolve exactly one source-or-destination identity. */
export function planBenchmarkPointBackfill(
  row: BackfillRow,
  backfill: BenchmarkPointBackfill,
): Record<string, unknown> | null {
  if (isApplied(row, backfill)) return null;

  const desiredOffloadMode = backfill.set.offloadMode ?? backfill.offloadMode;
  const malformedMetrics = recoverMalformedMetrics(row.metrics, backfill);
  const previousApplied =
    backfill.previousSet !== undefined &&
    isApplied(row, { ...backfill, set: backfill.previousSet });
  if (
    row.offload_mode === desiredOffloadMode &&
    desiredOffloadMode !== backfill.offloadMode &&
    malformedMetrics === null &&
    !previousApplied
  ) {
    throw new Error(
      `${backfill.id}: source identity is missing and the desired identity has unexpected data`,
    );
  }
  const sourceMetrics = asMetricsRecord(row.metrics) ?? malformedMetrics;
  if (!sourceMetrics) {
    throw new Error(`${backfill.id}: benchmark metrics have an unexpected JSON shape`);
  }
  const metrics = { ...sourceMetrics };
  for (const key of backfill.set.metricsRemove ?? []) delete metrics[key];
  Object.assign(metrics, metricsPatch(backfill));
  return metrics;
}
