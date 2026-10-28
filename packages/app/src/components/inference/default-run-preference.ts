import type { BenchmarkRow } from '@/lib/api/api';
import { benchmarkCurveDate } from '@/lib/benchmarks/benchmark-run-selection';
import { Model, Sequence } from '@/lib/catalog/data-mappings';

export const VR_DEFAULT_RUN = {
  enabled: true,
  model: Model.DeepSeek_V4_Pro,
  sequence: Sequence.AgenticTraces,
  date: '2026-09-09',
} as const;

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
