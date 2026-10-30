import {
  benchmarkCurveScope,
  curveLineImages,
  extendCurveLineImages,
} from '@semianalysisai/inferencex-constants';

import type { BenchmarkRow } from '@/lib/api/api';

export interface UnofficialSnapshot {
  runId: string;
  date: string;
  startedAt: string;
  runUrl: string | null;
}

// Mirrors latest_benchmarks' point identity: config natural key plus workload and recipe.
const pointKey = (row: BenchmarkRow): string =>
  JSON.stringify([
    row.model,
    row.hardware,
    row.framework,
    row.precision,
    row.spec_method,
    row.disagg,
    row.is_multinode,
    row.prefill_tp,
    row.prefill_ep,
    row.prefill_dp_attention,
    row.prefill_num_workers,
    row.decode_tp,
    row.decode_ep,
    row.decode_dp_attention,
    row.decode_num_workers,
    row.num_prefill_gpu,
    row.num_decode_gpu,
    row.benchmark_type,
    row.isl,
    row.osl,
    row.offload_mode,
    row.recipe_fingerprint ?? null,
    row.conc,
  ]);

// Producer runs of a published curve, newest first, in latest_benchmarks' run order.
// Every run but the oldest is append-only, or the older runs would not be published.
const producerRuns = (rows: BenchmarkRow[]): BenchmarkRow[][] =>
  [...Map.groupBy(rows, (row) => row.workflow_run_id).values()].toSorted(
    ([a], [b]) =>
      b.date.localeCompare(a.date) ||
      (b.run_started_at ?? '').localeCompare(a.run_started_at ?? '') ||
      (b.workflow_run_id ?? 0) - (a.workflow_run_id ?? 0),
  );

/**
 * Preview an append-only run the way ingestion will publish it: each curve it
 * touches inherits the published producer runs, newest first, while every topology
 * line in the chain keeps its image. Inherited rows keep their producer date and
 * ids but take the run's URL, which is the overlay's series identity.
 */
export function stitchAppendOnlyPreview(
  runRows: BenchmarkRow[],
  latestRows: BenchmarkRow[],
  snapshot: UnofficialSnapshot,
): BenchmarkRow[] {
  const runByScope = Map.groupBy(runRows, benchmarkCurveScope);
  const latestByScope = Map.groupBy(latestRows, benchmarkCurveScope);
  const curve = {
    curve_date: snapshot.date,
    // An unofficial snapshot has no workflow_runs row; negate to stay disjoint from real ids.
    curve_workflow_run_id: -Number(snapshot.runId),
    curve_run_started_at: snapshot.startedAt,
  };

  return [...runByScope].flatMap(([scope, rows]) => {
    const inherited: BenchmarkRow[] = [];
    let chain = curveLineImages(rows);
    for (const producer of producerRuns(latestByScope.get(scope) ?? [])) {
      chain = extendCurveLineImages(chain, curveLineImages(producer));
      if (!chain) break;
      inherited.push(...producer);
    }
    if (inherited.length === 0) return rows;
    const claimed = new Set(rows.map(pointKey));
    return [
      ...rows.map((row) => ({ ...row, ...curve })),
      ...inherited
        .filter((row) => !claimed.has(pointKey(row)))
        .map((row) => ({ ...row, ...curve, run_url: snapshot.runUrl })),
    ];
  });
}
