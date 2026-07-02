/**
 * Backfill: enforce the slow-tail interactivity invariant on agentic rows.
 *
 * Agentic trace-replay artifacts emit both `*_itl` and `*_intvty`. Historically
 * the harness wrote `*_intvty = 1/p(ITL)` (slow-tail — "interactivity at the
 * p-th latency"), which is what the inference chart's interactivity selector
 * and the detail time-series both assume. A later "timing fix" harness started
 * emitting `*_intvty = p(1/ITL)` instead (fast-tail — equivalent to
 * `1/p(100-x)(ITL)`), because taking the reciprocal reverses percentile order.
 * Ingest stores every metric verbatim, so those runs landed in the DB with the
 * opposite definition — e.g. p90 reading 23.9 instead of 11.2 for the same
 * point — contaminating cross-run Pareto comparisons.
 *
 * This rewrites `mean/p75/p90/p95 _intvty = 1/_itl` for every agentic row so the
 * stored value always matches the slow-tail definition the charts use. It is
 * idempotent: rows already on the correct definition are left untouched (guarded
 * by a relative-deviation check). `std_intvty` is intentionally NOT touched —
 * the reciprocal of a standard deviation is meaningless, and the API strips it.
 * The prior fast-tail value is discarded on purpose (p10_itl isn't stored, so it
 * isn't recoverable anyway, and per project policy fast-tail must not back a
 * slow-tail selector).
 *
 * Usage:
 *   pnpm --filter @semianalysisai/inferencex-db db:backfill-agentic-intvty --yes
 */

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';

// Percentile-style keys whose interactivity is the reciprocal of the matching
// ITL percentile. `std` is excluded by design (not a reciprocal); `median`/`p99`
// are absent from agentic artifacts so they never appear here.
const KEYS = ['mean', 'p75', 'p90', 'p95'] as const;

// Relative tolerance: skip rows already within 1e-6 of 1/itl so correct rows
// keep their original full-precision value and the change counts are accurate.
const REL_TOL = 1e-6;

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 1, onnotice: () => {} });

async function contaminationCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const k of KEYS) {
    const rows = await sql.unsafe(`
      SELECT count(*)::int AS n
      FROM benchmark_results
      WHERE benchmark_type = 'agentic_traces'
        AND metrics ? '${k}_itl' AND (metrics->>'${k}_itl')::numeric > 0
        AND metrics ? '${k}_intvty'
        AND abs((metrics->>'${k}_intvty')::numeric - 1.0 / (metrics->>'${k}_itl')::numeric)
            > ${REL_TOL} * (1.0 / (metrics->>'${k}_itl')::numeric)
    `);
    out[k] = (rows[0] as unknown as { n: number }).n;
  }
  return out;
}

async function main(): Promise<void> {
  const total = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM benchmark_results WHERE benchmark_type = 'agentic_traces'
  `;
  console.log(`Agentic rows: ${total[0]!.n}`);

  const before = await contaminationCounts();
  console.log('Contaminated (intvty != 1/itl) before:', JSON.stringify(before));
  if (KEYS.every((k) => before[k] === 0)) {
    console.log('Nothing to backfill — all agentic rows already satisfy intvty = 1/itl.');
    await sql.end();
    return;
  }

  if (!hasYesFlag() && !(await confirm('Rewrite *_intvty = 1/*_itl for these rows? (y/N) '))) {
    await sql.end();
    return;
  }

  let totalUpdated = 0;
  for (const k of KEYS) {
    // keys are from a fixed trusted const — safe to interpolate.
    const res = await sql.unsafe(`
      UPDATE benchmark_results
      SET metrics = jsonb_set(metrics, '{${k}_intvty}', to_jsonb(1.0 / (metrics->>'${k}_itl')::numeric))
      WHERE benchmark_type = 'agentic_traces'
        AND metrics ? '${k}_itl' AND (metrics->>'${k}_itl')::numeric > 0
        AND metrics ? '${k}_intvty'
        AND abs((metrics->>'${k}_intvty')::numeric - 1.0 / (metrics->>'${k}_itl')::numeric)
            > ${REL_TOL} * (1.0 / (metrics->>'${k}_itl')::numeric)
    `);
    console.log(`  ${k}_intvty: updated ${res.count} row(s)`);
    totalUpdated += res.count;
  }

  const after = await contaminationCounts();
  console.log('Contaminated after:', JSON.stringify(after));
  if (!KEYS.every((k) => after[k] === 0)) {
    throw new Error('Backfill incomplete — some rows still deviate. Aborting before MV refresh.');
  }

  await refreshLatestBenchmarks(sql);
  console.log(`Done. Rewrote ${totalUpdated} metric value(s) across agentic rows.`);
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
