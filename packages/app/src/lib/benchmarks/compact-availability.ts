import type { AvailabilityRow } from '@/lib/api/api';

/** A line's columns (strings as dictionary indexes), then its dates as `[gap, length, ...]` runs over `dates`. */
export type CompactAvailabilityLine = [
  model: number,
  isl: number | null,
  osl: number | null,
  precision: number,
  hardware: number,
  framework: number,
  specMethod: number,
  disagg: boolean,
  benchmarkType: number,
  dateRuns: number[],
];

/**
 * The dashboards' form of `/api/v1/availability`. A line is a row without its date,
 * and a line repeats on many dates, so each line is sent once with its dates as runs
 * of consecutive indexes into `dates` (every date, ascending). Lines keep the order
 * of their first row, which is the order the dashboards list sequences in.
 */
export interface CompactAvailability {
  readonly dates: string[];
  readonly models: string[];
  readonly precisions: string[];
  readonly hardware: string[];
  readonly frameworks: string[];
  readonly specMethods: string[];
  readonly benchmarkTypes: string[];
  readonly lines: CompactAvailabilityLine[];
}

function dictionary(values: string[]): (value: string) => number {
  const index = new Map<string, number>();
  return (value) => {
    let id = index.get(value);
    if (id === undefined) {
      id = values.length;
      index.set(value, id);
      values.push(value);
    }
    return id;
  };
}

export function compactAvailability(rows: readonly AvailabilityRow[]): CompactAvailability {
  const dates = [...new Set(rows.map((row) => row.date))].toSorted();
  const dateIndex = new Map(dates.map((date, i) => [date, i]));
  const compact: CompactAvailability = {
    dates,
    models: [],
    precisions: [],
    hardware: [],
    frameworks: [],
    specMethods: [],
    benchmarkTypes: [],
    lines: [],
  };
  const model = dictionary(compact.models);
  const precision = dictionary(compact.precisions);
  const hardware = dictionary(compact.hardware);
  const framework = dictionary(compact.frameworks);
  const specMethod = dictionary(compact.specMethods);
  const benchmarkType = dictionary(compact.benchmarkTypes);

  const lineIndex = new Map<string, number>();
  const lineDates: number[][] = [];
  for (const row of rows) {
    const key = JSON.stringify([
      row.model,
      row.isl,
      row.osl,
      row.precision,
      row.hardware,
      row.framework,
      row.spec_method,
      row.disagg,
      row.benchmark_type,
    ]);
    let line = lineIndex.get(key);
    if (line === undefined) {
      line = compact.lines.length;
      lineIndex.set(key, line);
      compact.lines.push([
        model(row.model),
        row.isl,
        row.osl,
        precision(row.precision),
        hardware(row.hardware),
        framework(row.framework),
        specMethod(row.spec_method),
        row.disagg,
        benchmarkType(row.benchmark_type),
        [],
      ]);
      lineDates.push([]);
    }
    lineDates[line]!.push(dateIndex.get(row.date)!);
  }

  for (const [i, line] of compact.lines.entries()) {
    const runs = line[9];
    let end = 0;
    for (const date of lineDates[i]!.toSorted((a, b) => a - b)) {
      if (date < end) continue;
      if (date === end && runs.length > 0) runs.push(runs.pop()! + 1);
      else runs.push(date - end, 1);
      end = date + 1;
    }
  }
  return compact;
}
