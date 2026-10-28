import { MODEL_OPTIONS, SEQUENCE_OPTIONS } from '@/lib/catalog/data-mappings';
import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

const MODELS = MODEL_OPTIONS;
const SEQUENCES = SEQUENCE_OPTIONS.map((s) => sequenceToIslOsl(s)).filter(
  (s): s is { isl: number; osl: number } => s !== null,
);

// `--dashboard` warms only what dashboards request on first load (after a
// deploy or an ingest); the default also walks history and recent dates.
const args = process.argv.slice(2).filter((a) => a !== '--');
const dashboardOnly = args.includes('--dashboard');
const rawUrl = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:3000';
const origin = new URL(rawUrl).origin;
const bypassSecret = process.env.VERCEL_PROTECTION_BYPASS_SECRET;
// The CDN caches one variant per Accept-Encoding, so warm the one browsers ask for.
const headers: Record<string, string> = {
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  ...(bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {}),
};

let total = 0;
let ok = 0;
let failed = 0;

/** Build the URL exactly as `lib/api/api.ts` does, so it shares the browser's cache key. */
function apiPath(path: string, params: Record<string, string> = {}): string {
  const search = new URLSearchParams(params).toString();
  return search ? `${path}?${search}` : path;
}

async function hit(path: string): Promise<void> {
  const url = `${origin}${path}`;
  total++;
  try {
    const start = performance.now();
    const res = await fetch(url, { headers });
    // The CDN only stores a streamed response that was read to the end.
    await res.arrayBuffer();
    const ms = Math.round(performance.now() - start);
    if (res.ok) {
      ok++;
      console.log(`  ✓ ${path}  (${ms}ms)`);
    } else {
      failed++;
      console.log(`  ✗ ${path}  ${res.status} (${ms}ms)`);
    }
  } catch (error) {
    failed++;
    console.log(`  ✗ ${path}  ${(error as Error).message}`);
  }
}

async function hitBatched(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 4) {
    await Promise.all(paths.slice(i, i + 4).map((p) => hit(p)));
  }
}

async function availableDates(): Promise<{ all: string[]; latestPerModel: string[] }> {
  try {
    const res = await fetch(`${origin}/api/v1/availability`, { headers });
    if (!res.ok) return { all: [], latestPerModel: [] };
    const rows = (await res.json()) as { model: string; date: string }[];
    const latest = new Map<string, string>();
    for (const row of rows) {
      if (row.date > (latest.get(row.model) ?? '')) latest.set(row.model, row.date);
    }
    return {
      all: [...new Set(rows.map((r) => r.date))].toSorted().toReversed(),
      latestPerModel: [...new Set(latest.values())].toSorted().toReversed(),
    };
  } catch {
    return { all: [], latestPerModel: [] };
  }
}

async function warmupCaches() {
  const start = performance.now();
  console.log(`Warming up${dashboardOnly ? ' dashboards' : ''}: ${origin}\n`);

  console.log('Singleton endpoints:');
  await Promise.all([
    hit('/api/v1/availability'),
    hit('/api/v1/reliability'),
    hit('/api/v1/evaluations'),
    hit('/api/v1/submissions'),
  ]);

  console.log('\nBenchmarks (latest) per model:');
  await hitBatched(MODELS.map((model) => apiPath('/api/v1/benchmarks', { model })));

  const dates = await availableDates();
  // Dashboards ask for the latest run date of the selected model.
  console.log('\nWorkflow info (latest date of each model):');
  await hitBatched(dates.latestPerModel.map((date) => apiPath('/api/v1/workflow-info', { date })));

  if (!dashboardOnly) {
    console.log('\nBenchmark history per model × sequence:');
    await hitBatched(
      MODELS.flatMap((model) =>
        SEQUENCES.map(({ isl, osl }) =>
          apiPath('/api/v1/benchmarks/history', { model, isl: String(isl), osl: String(osl) }),
        ),
      ),
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const cutoffStr = cutoff.toISOString().split('T')[0]!;
    const recentDates = dates.all.filter((d) => d >= cutoffStr);

    console.log('\nBenchmarks per model × date (exact):');
    await hitBatched(
      MODELS.flatMap((model) =>
        recentDates.map((date) => apiPath('/api/v1/benchmarks', { model, date, exact: 'true' })),
      ),
    );

    console.log(`\nWorkflow info (${recentDates.length} dates from availability):`);
    await hitBatched(recentDates.map((date) => apiPath('/api/v1/workflow-info', { date })));
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`\nDone: ${ok}/${total} succeeded, ${failed} failed (${elapsed}s)`);
  if (failed > 0) {
    throw new Error(`${failed} cache warmup request${failed === 1 ? '' : 's'} failed`);
  }
}

warmupCaches().catch((error) => {
  console.error('warmup-cache failed:', error);
  process.exitCode = 1;
});
