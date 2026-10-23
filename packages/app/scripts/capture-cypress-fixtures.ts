import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import {
  buildDataset,
  makeCollectiveXDataset,
  makeRawShard,
} from '@semianalysisai/inferencex-db/collectivex/test-fixture';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';
import {
  FIXTURE_MANIFEST_FILENAME,
  FIXTURE_MANIFEST_SCHEMA_VERSION,
  type FixtureManifest,
  type FixtureManifestEntry,
  assertFixtureContent,
  fixtureSha256,
  fixtureTopLevel,
} from '../src/lib/testing/test-fixture-manifest';

const cliArgs = process.argv.filter((argument) => argument !== '--').slice(2);
const collectiveXOnly = cliArgs.includes('--collectivex-only');
const baseUrl = (
  cliArgs.find((argument) => !argument.startsWith('--')) ?? 'https://inferencex.semianalysis.com'
).replace(/\/$/u, '');

const fixturesDir = resolve(import.meta.dirname, '..', 'cypress', 'fixtures', 'api');

const BENCHMARK_MODEL = 'DeepSeek-R1-0528';

const HISTORY_MODEL = 'DeepSeek-R1-0528';
const HISTORY_PAIRS: [number, number][] = [
  [1024, 1024],
  [1024, 8192],
  [8192, 1024],
];

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
  const minified = name.startsWith('collectivex-');
  const body = `${JSON.stringify(data, null, minified ? undefined : 2)}\n`;
  await writeFile(resolve(fixturesDir, `${name}.json`), body);
  return body.length;
}
async function writeFixtureManifest(updatedNames: Set<string>, source: string): Promise<void> {
  const manifestPath = resolve(fixturesDir, FIXTURE_MANIFEST_FILENAME);
  let previous: FixtureManifest | null = null;
  try {
    previous = JSON.parse(await readFile(manifestPath, 'utf8')) as FixtureManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const capturedAt = new Date().toISOString();
  const directoryEntries = await readdir(fixturesDir);
  const fixtureFiles = directoryEntries
    .filter((name) => name.endsWith('.json') && name !== FIXTURE_MANIFEST_FILENAME)
    .toSorted();
  const fixtures: Record<string, FixtureManifestEntry> = {};
  for (const filename of fixtureFiles) {
    const name = filename.slice(0, -'.json'.length);
    const body = await readFile(resolve(fixturesDir, filename), 'utf8');
    const value = JSON.parse(body) as unknown;
    assertFixtureContent(name, value);
    const oldEntry = previous?.fixtures[name];
    const wasUpdated = updatedNames.has(name);
    fixtures[name] = {
      bytes: Buffer.byteLength(body),
      capturedAt: wasUpdated ? capturedAt : (oldEntry?.capturedAt ?? null),
      sha256: fixtureSha256(body),
      source: wasUpdated ? source : (oldEntry?.source ?? null),
      topLevel: fixtureTopLevel(value),
    };
  }

  const manifest: FixtureManifest = {
    schemaVersion: FIXTURE_MANIFEST_SCHEMA_VERSION,
    generatedAt: capturedAt,
    fixtures,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function writeCollectiveXFixtures(): Promise<[string, number][]> {
  const latest = makeCollectiveXDataset();
  const comparison = buildDataset({
    shards: [makeRawShard({ precision: 'fp8' })],
    meta: {
      run_id: '159',
      generated_at: '2026-07-07T12:20:00Z',
      source_sha: 'd'.repeat(40),
    },
  });
  const datasets = [latest, comparison];
  const sizes: [string, number][] = [
    ['collectivex-latest', await writeFixture('collectivex-latest', latest)],
  ];
  for (const dataset of datasets.slice(1)) {
    const name = `collectivex-run-${dataset.run.run_id}`;
    sizes.push([name, await writeFixture(name, dataset)]);
  }
  sizes.push([
    'collectivex-runs',
    await writeFixture('collectivex-runs', {
      version: 1,
      runs: datasets.map(buildRunSummary),
      discovery_complete: true,
    }),
  ]);
  return sizes;
}

function printSizes(sizes: [string, number][]) {
  for (const [name, bytes] of sizes) {
    console.log(`  ${name.padEnd(22)} ${(bytes / 1024).toFixed(1).padStart(8)} KB`);
  }
  console.log(`\nWrote ${sizes.length} fixtures to ${fixturesDir}`);
}

async function main() {
  await mkdir(fixturesDir, { recursive: true });
  if (collectiveXOnly) {
    console.log('Generating synthetic CollectiveX fixtures');
    const sizes = await writeCollectiveXFixtures();
    await writeFixtureManifest(new Set(sizes.map(([name]) => name)), 'synthetic://collectivex');
    printSizes(sizes);
    return;
  }

  console.log(`Capturing fixtures from ${baseUrl}`);

  const latestDate = await fetchLatestDate();
  console.log(
    `Latest date: ${latestDate}; keeping top ${TOP_DATES_PER_PARTITION} dates per partition`,
  );

  const availability = await fetchJson<{ date: string; model: string }[]>('/api/v1/availability');
  const reliability = await fetchJson<{ date: string; hardware: string }[]>('/api/v1/reliability');
  const evaluations = await fetchJson<{ date: string; model: string }[]>('/api/v1/evaluations');

  const benchmarks = await fetchJson<BenchmarkRow[]>(
    `/api/v1/benchmarks?model=${encodeURIComponent(BENCHMARK_MODEL)}`,
  );

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
  const collectiveXSizes = await writeCollectiveXFixtures();
  const sizes: [string, number][] = [
    [
      'availability',
      await writeFixture(
        'availability',
        keepTopDatesPerPartition(availability, (r) => r.model, N),
      ),
    ],
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
    ...collectiveXSizes,
  ];

  const collectiveXNames = new Set(collectiveXSizes.map(([name]) => name));
  await writeFixtureManifest(
    new Set(sizes.map(([name]) => name).filter((name) => !collectiveXNames.has(name))),
    baseUrl,
  );
  await writeFixtureManifest(collectiveXNames, 'synthetic://collectivex');
  printSizes(sizes);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
