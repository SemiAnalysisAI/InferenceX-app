import { benchmarkCurveScope } from '@semianalysisai/inferencex-constants';

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

/**
 * Preview an append-only run the way ingestion will publish it: each curve it
 * touches extends the current published curve when every point on both sides
 * shares one image. Inherited rows keep their producer date and ids but take the
 * run's URL, which is the overlay's series identity.
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
    const images = new Set(rows.map((row) => row.image));
    const [image] = images;
    const predecessors = latestByScope.get(scope) ?? [];
    if (
      images.size !== 1 ||
      !image ||
      predecessors.length === 0 ||
      predecessors.some((row) => row.image !== image)
    ) {
      return rows;
    }
    const claimed = new Set(rows.map(pointKey));
    return [
      ...rows.map((row) => ({ ...row, ...curve })),
      ...predecessors
        .filter((row) => !claimed.has(pointKey(row)))
        .map((row) => ({ ...row, ...curve, run_url: snapshot.runUrl })),
    ];
  });
}
