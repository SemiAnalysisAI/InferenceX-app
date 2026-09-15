import type { BenchmarkRow } from '@/lib/api';
import { benchmarkCurveDate } from '@/lib/benchmark-run-selection';
import { Model, Sequence } from '@/lib/data-mappings';

/** Default inference snapshot. Disable when a newer VR baseline is approved. */
export const VR_DEFAULT_RUN = {
  enabled: true,
  model: Model.DeepSeek_V4_Pro,
  sequence: Sequence.AgenticTraces,
  date: '2026-09-09',
} as const;

/** Only the affected line; other VR models, engines and workloads keep their defaults. */
export function isPreferredVrLine(row: BenchmarkRow): boolean {
  return (
    row.hardware === 'vr200' &&
    row.model === 'dsv4' &&
    row.framework === 'trt' &&
    row.precision === 'fp4' &&
    row.benchmark_type === 'agentic_traces' &&
    row.disagg &&
    (row.offload_mode ?? 'off') === 'off'
  );
}

/**
 * Replace the complete line with the exact-date API snapshot, including changed
 * topologies. The API selects one logical curve for that date, independently of
 * the result/run IDs assigned during import. Keep point provenance and metrics
 * intact, including older producer points carried into that logical snapshot.
 */
export function preferVrDefaultRun(
  rows: BenchmarkRow[],
  preferredRows: BenchmarkRow[],
): BenchmarkRow[] {
  const replacement = preferredRows.filter(
    (row) => isPreferredVrLine(row) && benchmarkCurveDate(row) === VR_DEFAULT_RUN.date,
  );
  if (replacement.length === 0 || !rows.some(isPreferredVrLine)) return rows;
  return [...rows.filter((row) => !isPreferredVrLine(row)), ...replacement];
}
