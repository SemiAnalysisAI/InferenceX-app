/** Build a minimal AIPerf scrape CSV: one gauge section and one counter section. */
export function scrapeCsv(
  rows: {
    type: 'gauge' | 'counter';
    metric: string;
    value: number;
    endpoint?: string;
    labels?: Record<string, string>;
  }[],
): string {
  const labelNames = [...new Set(rows.flatMap((row) => Object.keys(row.labels ?? {})))];
  const section = (type: 'gauge' | 'counter', stats: string[]) => {
    const lines = rows
      .filter((row) => row.type === type)
      .map((row) =>
        [
          row.endpoint ?? 'localhost:8000',
          type,
          row.metric,
          '',
          ...stats.map(() => String(row.value)),
          ...labelNames.map((name) => row.labels?.[name] ?? ''),
          'description',
        ].join(','),
      );
    return [
      ['Endpoint', 'Type', 'Metric', 'Unit', ...stats, ...labelNames, 'Description'].join(','),
      ...lines,
    ];
  };
  return [...section('gauge', ['avg', 'min', 'max']), '', ...section('counter', ['total'])].join(
    '\n',
  );
}
