/**
 * Read AIPerf's `server_metrics_export.csv`: one row per scraped Prometheus
 * series with its profiling-phase summary stats (`total` for counters,
 * `avg`/`max` for gauges). It is the same summary the JSON export carries,
 * small enough to read on every ingest, recompute, and unofficial overlay.
 */

export interface ScrapeSeries {
  endpoint: string;
  labels: Record<string, string>;
  stats: Record<string, number>;
}

/** Metric name → series. */
export type Scrape = ReadonlyMap<string, readonly ScrapeSeries[]>;

const STAT_COLUMN =
  /^(?:avg|min|max|std|total|sum|count|rate|p\d+(?:\.\d+)?(?:_estimate)?|(?:rate|count|sum)_\w+)$/u;
const NON_LABEL_COLUMNS = new Set(['Endpoint', 'Type', 'Metric', 'Unit', 'Description', 'buckets']);

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

export function parseScrapeCsv(text: string): Scrape {
  const scrape = new Map<string, ScrapeSeries[]>();
  let header: string[] | null = null;
  for (const line of text.split(/\r?\n/u)) {
    if (line === '' || line.startsWith('#')) continue;
    const cells = splitCsvLine(line);
    if (cells[0] === 'Endpoint') {
      // Info sections (`Endpoint,Metric,Key,Value`) carry no numeric series.
      header = cells[1] === 'Type' ? cells : null;
      continue;
    }
    if (!header) continue;
    const series: ScrapeSeries = { endpoint: cells[0] ?? '', labels: {}, stats: {} };
    for (const [i, column] of header.entries()) {
      const value = cells[i] ?? '';
      if (value === '' || NON_LABEL_COLUMNS.has(column)) continue;
      if (STAT_COLUMN.test(column)) {
        const n = Number(value);
        if (Number.isFinite(n)) series.stats[column] = n;
      } else {
        series.labels[column] = value;
      }
    }
    const metric = cells[2] ?? '';
    scrape.set(metric, [...(scrape.get(metric) ?? []), series]);
  }
  return scrape;
}

const COUNTER_KEYS = ['total', 'sum', 'max', 'avg'] as const;
const GAUGE_KEYS = ['max', 'avg', 'total'] as const;
type SeriesFilter = (series: ScrapeSeries) => boolean;

function seriesStat(series: ScrapeSeries, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = series.stats[key];
    if (value !== undefined) return value;
  }
  return null;
}

function seriesOf(scrape: Scrape, names: string | readonly string[]): readonly ScrapeSeries[] {
  return (typeof names === 'string' ? [names] : names).flatMap((name) => scrape.get(name) ?? []);
}

/** Sum one stat across every series of the named metrics (counter totals). */
export function sumStat(
  scrape: Scrape,
  names: string | readonly string[],
  filter: SeriesFilter = () => true,
  keys: readonly string[] = COUNTER_KEYS,
): number | null {
  let total: number | null = null;
  for (const series of seriesOf(scrape, names)) {
    const value = filter(series) ? seriesStat(series, keys) : null;
    if (value !== null) total = (total ?? 0) + value;
  }
  return total;
}

/** Max (or mean) of one gauge stat across series. */
export function gaugeStat(
  scrape: Scrape,
  names: string | readonly string[],
  combine: 'max' | 'avg' = 'max',
  keys: readonly string[] = combine === 'max' ? GAUGE_KEYS : ['avg', 'max', 'total'],
): number | null {
  const values = seriesOf(scrape, names).flatMap((series) => seriesStat(series, keys) ?? []);
  if (values.length === 0) return null;
  return combine === 'max'
    ? Math.max(...values)
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Counter totals grouped by one label value. */
export function sumByLabel(scrape: Scrape, name: string, label: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const series of seriesOf(scrape, name)) {
    const key = series.labels[label];
    const value = seriesStat(series, COUNTER_KEYS);
    if (key !== undefined && value !== null) out.set(key, (out.get(key) ?? 0) + value);
  }
  return out;
}

export function rate(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || !(denominator > 0)
    ? null
    : numerator / denominator;
}

/** Gauges are exported as either 0..1 or 0..100. */
export function fraction(value: number | null): number | null {
  return value !== null && value > 1.5 ? value / 100 : value;
}
