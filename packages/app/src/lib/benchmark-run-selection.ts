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
}

const seriesKey = (row: BenchmarkSeriesRow): string => {
  const specMethod = row.benchmark_type === 'agentic_traces' ? '' : row.spec_method;
  return `${row.hardware}|${row.framework}|${specMethod}|${row.disagg}|${row.precision}|${row.offload_mode ?? 'off'}`;
};

function isLaterRun(candidate: BenchmarkSeriesRow, current: BenchmarkSeriesRow): boolean {
  const startedAt = candidate.run_started_at ?? '';
  const currentStartedAt = current.run_started_at ?? '';
  return (
    startedAt > currentStartedAt ||
    (startedAt === currentStartedAt &&
      (candidate.workflow_run_id ?? Number.NEGATIVE_INFINITY) >
        (current.workflow_run_id ?? Number.NEGATIVE_INFINITY))
  );
}

function isWinningRun(row: BenchmarkSeriesRow, winner: BenchmarkSeriesRow): boolean {
  return (
    row.run_started_at === winner.run_started_at && row.workflow_run_id === winner.workflow_run_id
  );
}

/** Keep only the newest date for each chart series and, for agentic, one workflow run. */
export function dedupeRowsToLatestPerConfig<T extends BenchmarkSeriesRow>(rows: T[]): T[] {
  const winnerPerGroup = new Map<string, T>();
  for (const row of rows) {
    const key = seriesKey(row);
    const current = winnerPerGroup.get(key);
    if (!current || row.date > current.date) {
      winnerPerGroup.set(key, row);
      continue;
    }
    if (
      row.date === current.date &&
      row.benchmark_type === 'agentic_traces' &&
      isLaterRun(row, current)
    ) {
      winnerPerGroup.set(key, row);
    }
  }
  return rows.filter((row) => {
    const winner = winnerPerGroup.get(seriesKey(row));
    if (!winner || row.date !== winner.date) return false;
    return row.benchmark_type !== 'agentic_traces' || isWinningRun(row, winner);
  });
}

/** For historical views, keep one agentic workflow run per series on each calendar date. */
export function dedupeAgenticHistoryRuns<T extends BenchmarkSeriesRow>(rows: T[]): T[] {
  const winnerPerDateAndSeries = new Map<string, T>();
  for (const row of rows) {
    if (row.benchmark_type !== 'agentic_traces') continue;
    const key = `${row.date}|${seriesKey(row)}`;
    const current = winnerPerDateAndSeries.get(key);
    if (!current || isLaterRun(row, current)) winnerPerDateAndSeries.set(key, row);
  }
  return rows.filter((row) => {
    if (row.benchmark_type !== 'agentic_traces') return true;
    const winner = winnerPerDateAndSeries.get(`${row.date}|${seriesKey(row)}`);
    return winner !== undefined && isWinningRun(row, winner);
  });
}
