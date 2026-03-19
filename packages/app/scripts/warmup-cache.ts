import { MODEL_OPTIONS, SEQUENCE_OPTIONS } from '@/lib/data-mappings';
import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';

/**
 * Warm up API caches by querying all endpoints the frontend uses.
 *
 * Usage:
 *   pnpm admin:cache:warmup [url]           (default: http://localhost:3000)
 *   pnpm admin:cache:warmup https://inferencex.semianalysis.com
 */

const MODELS = MODEL_OPTIONS;
const SEQUENCES = SEQUENCE_OPTIONS.map((s) => sequenceToIslOsl(s)).filter(
  (s): s is { isl: number; osl: number } => s !== null,
);

const rawUrl = process.argv.filter((a) => a !== '--').slice(2)[0] ?? 'http://localhost:3000';
const origin = new URL(rawUrl).origin;

let total = 0;
let ok = 0;
let failed = 0;

async function hit(path: string): Promise<void> {
  const url = `${origin}${path}`;
  total++;
  try {
    const start = performance.now();
    const res = await fetch(url);
    const ms = Math.round(performance.now() - start);
    if (res.ok) {
      ok++;
      console.log(`  ✓ ${path}  (${ms}ms)`);
    } else {
      failed++;
      console.log(`  ✗ ${path}  ${res.status} (${ms}ms)`);
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${path}  ${(err as Error).message}`);
  }
}

async function warmupCaches() {
  const start = performance.now();
  console.log(`Warming up: ${origin}\n`);

  // --- Singleton endpoints (no params) ---
  console.log('Singleton endpoints:');
  await Promise.all([
    hit('/api/v1/availability'),
    hit('/api/v1/reliability'),
    hit('/api/v1/evaluations'),
    hit('/api/v1/github-stars'),
  ]);

  // --- Benchmarks (latest) per model ---
  console.log('\nBenchmarks (latest) per model:');
  for (const model of MODELS) {
    await hit(`/api/v1/benchmarks?model=${encodeURIComponent(model)}`);
  }

  // --- Benchmark history per model × sequence ---
  console.log('\nBenchmark history per model × sequence:');
  const historyPaths: string[] = [];
  for (const model of MODELS) {
    for (const seq of SEQUENCES) {
      historyPaths.push(
        `/api/v1/benchmarks/history?model=${encodeURIComponent(model)}&isl=${seq.isl}&osl=${seq.osl}`,
      );
    }
  }
  // Run in batches of 4 to avoid hammering the server
  for (let i = 0; i < historyPaths.length; i += 4) {
    await Promise.all(historyPaths.slice(i, i + 4).map((p) => hit(p)));
  }

  // --- Workflow info for recent dates ---
  console.log('\nWorkflow info (last 3 dates):');
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];
    await hit(`/api/v1/workflow-info?date=${date}`);
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`\nDone: ${ok}/${total} succeeded, ${failed} failed (${elapsed}s)`);
}

warmupCaches().catch((err) => {
  console.error('warmup-cache failed:', err);
  process.exitCode = 1;
});
