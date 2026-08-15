/** Fields needed to select one workflow run for a rendered benchmark series. */
export interface BenchmarkSeriesRow {
  hardware: string;
  framework: string;
  spec_method: string;
  disagg: boolean;
  precision: string;
  offload_mode?: string | null;
  benchmark_type?: string;
  date: string;
  workflow_run_id?: number;
  run_started_at?: string | null;
  curve_date?: string;
  curve_workflow_run_id?: number;
  curve_run_started_at?: string | null;
}

export const benchmarkCurveDate = (row: BenchmarkSeriesRow): string => row.curve_date ?? row.date;

export const benchmarkCurveWorkflowRunId = (row: BenchmarkSeriesRow): number | undefined =>
  row.curve_workflow_run_id ?? row.workflow_run_id;

export const benchmarkCurveRunStartedAt = (row: BenchmarkSeriesRow): string | null | undefined =>
  row.curve_run_started_at ?? row.run_started_at;

const seriesKey = (row: BenchmarkSeriesRow): string => {
  const specMethod = row.benchmark_type === 'agentic_traces' ? '' : row.spec_method;
  return `${row.hardware}|${row.framework}|${specMethod}|${row.disagg}|${row.precision}|${row.offload_mode ?? 'off'}`;
};

function isLaterRun(candidate: BenchmarkSeriesRow, current: BenchmarkSeriesRow): boolean {
  const startedAt = benchmarkCurveRunStartedAt(candidate) ?? '';
  const currentStartedAt = benchmarkCurveRunStartedAt(current) ?? '';
  return (
    startedAt > currentStartedAt ||
    (startedAt === currentStartedAt &&
      (benchmarkCurveWorkflowRunId(candidate) ?? Number.NEGATIVE_INFINITY) >
        (benchmarkCurveWorkflowRunId(current) ?? Number.NEGATIVE_INFINITY))
  );
}

function isWinningRun(row: BenchmarkSeriesRow, winner: BenchmarkSeriesRow): boolean {
  return (
    benchmarkCurveRunStartedAt(row) === benchmarkCurveRunStartedAt(winner) &&
    benchmarkCurveWorkflowRunId(row) === benchmarkCurveWorkflowRunId(winner)
  );
}

/** Keep only the newest date for each chart series and, for agentic, one workflow run. */
export function dedupeRowsToLatestPerConfig<T extends BenchmarkSeriesRow>(rows: T[]): T[] {
  const winnerPerGroup = new Map<string, T>();
  for (const row of rows) {
    const key = seriesKey(row);
    const current = winnerPerGroup.get(key);
    if (!current || benchmarkCurveDate(row) > benchmarkCurveDate(current)) {
      winnerPerGroup.set(key, row);
      continue;
    }
    if (
      benchmarkCurveDate(row) === benchmarkCurveDate(current) &&
      row.benchmark_type === 'agentic_traces' &&
      isLaterRun(row, current)
    ) {
      winnerPerGroup.set(key, row);
    }
  }
  return rows.filter((row) => {
    const winner = winnerPerGroup.get(seriesKey(row));
    if (!winner || benchmarkCurveDate(row) !== benchmarkCurveDate(winner)) return false;
    return row.benchmark_type !== 'agentic_traces' || isWinningRun(row, winner);
  });
}

/** For historical views, keep one agentic workflow run per series on each calendar date. */
export function dedupeAgenticHistoryRuns<T extends BenchmarkSeriesRow>(rows: T[]): T[] {
  const winnerPerDateAndSeries = new Map<string, T>();
  for (const row of rows) {
    if (row.benchmark_type !== 'agentic_traces') continue;
    const key = `${benchmarkCurveDate(row)}|${seriesKey(row)}`;
    const current = winnerPerDateAndSeries.get(key);
    if (!current || isLaterRun(row, current)) winnerPerDateAndSeries.set(key, row);
  }
  return rows.filter((row) => {
    if (row.benchmark_type !== 'agentic_traces') return true;
    const winner = winnerPerDateAndSeries.get(`${benchmarkCurveDate(row)}|${seriesKey(row)}`);
    return winner !== undefined && isWinningRun(row, winner);
  });
}
