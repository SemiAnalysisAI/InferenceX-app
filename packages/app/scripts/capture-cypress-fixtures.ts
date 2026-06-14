/**
 * Capture cypress fixtures from a running InferenceX deployment.
 *
 * Hits the public production API by default and writes one JSON file per
 * endpoint into cypress/fixtures/api/. The cypress e2e suite uses these
 * fixtures via cy.intercept so tests run with no database.
 *
 * Usage:
 *   pnpm --filter app capture:fixtures                              (prod)
 *   pnpm --filter app capture:fixtures http://localhost:3000        (local dev)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = (
  process.argv.filter((a) => a !== '--').slice(2)[0] ?? 'https://inferencex.semianalysis.com'
).replace(/\/$/u, '');

// `import.meta.dirname` is undefined when this script runs through tsx's CJS
// loader (no `"type": "module"` in packages/app/package.json). `__dirname` is
// reliably defined in that mode.
const fixturesDir = resolve(__dirname, '..', 'cypress', 'fixtures', 'api');

// Defaults chosen to land on common, well-populated rows. The cypress suite
// doesn't assert on specific values, so any realistic snapshot suffices.
const BENCHMARK_MODEL = 'DeepSeek-R1-0528';

// History must cover every (isl, osl) combo that appears in the benchmarks
// fixture, otherwise the drill-down trend modal shows "no historical data"
// when the user double-clicks a scatter point with a non-default (isl, osl).
const HISTORY_MODEL = 'DeepSeek-R1-0528';
const HISTORY_PAIRS: [number, number][] = [
  [1024, 1024],
  [1024, 8192],
  [8192, 1024],
];

// Top-N most-recent unique dates kept per partition. Partitioning by model
// (or hardware) ensures infrequently-benchmarked entries — e.g. llama70b
// last ran in late 2025 — still get N dates of data instead of being culled
// by a global calendar window.
const TOP_DATES_PER_PARTITION = 10;

async function fetchLatestDate(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/availability`);
  if (!res.ok) throw new Error(`availability fetch failed: ${res.status}`);
  const rows = (await res.json()) as { date: string }[];
  if (rows.length === 0) throw new Error('availability returned no rows');
  return rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) throw new Error(`${path} fetch failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/**
 * Keep rows whose date is among the N most-recent unique dates *within their
 * partition*. Partitioning is the load-bearing piece: a global "top N dates"
 * window would silently drop infrequent entries (e.g. llama70b's last ran
 * months before the latest dsr1 run), but partitioning by model gives every
 * model its own N-date window.
 */
function keepTopDatesPerPartition<T extends { date: string }>(
  rows: T[],
  partition: (r: T) => string,
  n: number,
): T[] {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    const k = partition(r);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  const out: T[] = [];
  for (const arr of buckets.values()) {
    const dates = new Set([...new Set(arr.map((r) => r.date))].toSorted().toReversed().slice(0, n));
    for (const r of arr) if (dates.has(r.date)) out.push(r);
  }
  return out;
}

/**
 * Within each partition, keep at most `n` rows by sampling evenly along
 * `axis` (typically `conc`). Used to shrink benchmark sweeps that have ~20
 * concurrency levels per config when the chart only needs a handful to
 * render. Preserves the lowest and highest values so chart axis ranges stay
 * representative.
 */
function sampleAlongAxis<T>(
  rows: T[],
  partition: (r: T) => string,
  axis: (r: T) => number,
  n: number,
): T[] {
  const buckets = new Map<string, T[]>();
  for (const r of rows) {
    const k = partition(r);
    const arr = buckets.get(k);
    if (arr) arr.push(r);
    else buckets.set(k, [r]);
  }
  const out: T[] = [];
  for (const arr of buckets.values()) {
    if (arr.length <= n) {
      out.push(...arr);
      continue;
    }
    const sorted = [...arr].toSorted((a, b) => axis(a) - axis(b));
    const step = (sorted.length - 1) / (n - 1);
    const seen = new Set<number>();
    for (let i = 0; i < n; i++) {
      const idx = Math.round(i * step);
      if (!seen.has(idx)) {
        seen.add(idx);
        out.push(sorted[idx]);
      }
    }
  }
  return out;
}

async function writeFixture(name: string, data: unknown): Promise<number> {
  // Pretty-print: matches oxfmt's output so re-running capture doesn't dirty
  // the working tree on the formatter pass.
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(resolve(fixturesDir, `${name}.json`), body);
  return body.length;
}

async function main() {
  console.log(`Capturing fixtures from ${baseUrl}`);
  await mkdir(fixturesDir, { recursive: true });

  const latestDate = await fetchLatestDate();
  console.log(
    `Latest date: ${latestDate}; keeping top ${TOP_DATES_PER_PARTITION} dates per partition`,
  );

  const availability = await fetchJson<{ date: string; model: string }[]>('/api/v1/availability');
  const reliability = await fetchJson<{ date: string; hardware: string }[]>('/api/v1/reliability');
  const evaluations = await fetchJson<{ date: string; model: string }[]>('/api/v1/evaluations');

  // Latest-snapshot: already deduped to one row per config, no date filter.
  // ~20 conc levels per (hw, fw, prec, isl, osl) — sample down to keep the
  // scatter visually populated without writing every concurrency point.
  interface BenchmarkRow {
    conc: number;
    hardware: string;
    framework: string;
    precision: string;
    isl: number;
    osl: number;
  }
  const benchmarks = await fetchJson<BenchmarkRow[]>(
    `/api/v1/benchmarks?model=${encodeURIComponent(BENCHMARK_MODEL)}`,
  );

  // History: merge the (isl, osl) pairs that the benchmarks fixture covers
  // and partition by hardware/framework/precision/isl/osl so each scatter
  // point has multi-date data when the user double-clicks it.
  interface HistoryRow {
    date: string;
    conc: number;
    hardware: string;
    framework: string;
    precision: string;
    isl: number;
    osl: number;
  }
  const historyMerged: HistoryRow[] = [];
  for (const [isl, osl] of HISTORY_PAIRS) {
    historyMerged.push(
      ...(await fetchJson<HistoryRow[]>(
        `/api/v1/benchmarks/history?model=${encodeURIComponent(HISTORY_MODEL)}&isl=${isl}&osl=${osl}`,
      )),
    );
  }

  const submissions = await fetchJson<{ summary: unknown[]; volume: unknown[] }>(
    '/api/v1/submissions',
  );

  const workflowInfo = await fetchJson<unknown>(
    `/api/v1/workflow-info?date=${encodeURIComponent(latestDate)}`,
  );

  const N = TOP_DATES_PER_PARTITION;
  const sizes: [string, number][] = [
    [
      'availability',
      await writeFixture(
        'availability',
        keepTopDatesPerPartition(availability, (r) => r.model, N),
      ),
    ],
    // Reliability is not truncated: the chart aggregates per hardware over
    // user-selectable date windows ("Last 7 days" vs "Last 3 months"), and
    // tests assert that switching windows changes the bar count. Truncating
    // to a fixed top-N collapses every hardware onto the same recent dates,
    // which makes the windows produce identical bar counts and that
    // assertion fails. Full reliability is small (~270 KB) so we just keep it.
    ['reliability', await writeFixture('reliability', reliability)],
    [
      'evaluations',
      await writeFixture(
        'evaluations',
        keepTopDatesPerPartition(evaluations, (r) => r.model, N),
      ),
    ],
    [
      'benchmarks',
      await writeFixture(
        'benchmarks',
        sampleAlongAxis(
          benchmarks,
          (r) => `${r.hardware}|${r.framework}|${r.precision}|${r.isl}|${r.osl}`,
          (r) => r.conc,
          5,
        ),
      ),
    ],
    [
      'benchmarks-history',
      // Two-pass: trim to top-N dates per config, then sample concurrencies
      // within each (config, date) so trend lines have multi-date coverage
      // but each (config, date) point doesn't carry every conc level.
      await writeFixture(
        'benchmarks-history',
        sampleAlongAxis(
          keepTopDatesPerPartition(
            historyMerged,
            (r) => `${r.hardware}|${r.framework}|${r.precision}|${r.isl}|${r.osl}`,
            N,
          ),
          (r) => `${r.hardware}|${r.framework}|${r.precision}|${r.isl}|${r.osl}|${r.date}`,
          (r) => r.conc,
          3,
        ),
      ),
    ],
    [
      'submissions',
      await writeFixture('submissions', {
        summary: submissions.summary.slice(0, 100),
        volume: submissions.volume,
      }),
    ],
    ['workflow-info', await writeFixture('workflow-info', workflowInfo)],
  ];

  for (const [name, bytes] of sizes) {
    console.log(`  ${name.padEnd(22)} ${(bytes / 1024).toFixed(1).padStart(8)} KB`);
  }
  console.log(`\nWrote ${sizes.length} fixtures to ${fixturesDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
