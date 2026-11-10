/**
 * A downstream deployment reads the public database and its own database side
 * by side. Its own runs, benchmarks, and evals take ids from
 * `DOWNSTREAM_ID_START` up, so ids never collide in combined responses and an
 * id alone says which database holds the row. The public database never
 * reaches this range.
 */
export const DOWNSTREAM_ID_START = 1_000_000_000_000;

/** Tables whose ids reach clients and are routed by range. */
export const RESERVED_ID_TABLES = ['workflow_runs', 'benchmark_results', 'eval_results'] as const;

export function isPublicRowId(id: number): boolean {
  return id < DOWNSTREAM_ID_START;
}
