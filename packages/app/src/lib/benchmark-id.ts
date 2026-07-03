/**
 * Shared guard for `benchmark_results.id` values.
 *
 * `benchmark_results.id` is a Postgres bigserial that starts at 1, so a real
 * persisted row always has a positive integer id. Overlay / `?unofficialrun=`
 * points are transformed live from raw artifacts and never carry a DB id — the
 * transform yields `undefined` (older code produced `NaN` via `Number(undefined)`).
 *
 * A bare `typeof id === 'number'` check is NOT enough: `NaN` and `0` are both
 * `number` yet neither is a real row. Passing them to the id-keyed endpoints
 * (`/api/v1/derived-agentic-metrics?ids=…`, `…?id=…`) yields a 400 (the routes
 * filter to `Number.isFinite(n) && n > 0`), and building an
 * `/inference/agentic/<id>` link out of one points at a non-existent row.
 *
 * Use this predicate at every site that collects ids for a fetch or builds a
 * per-point detail link so overlay-only views skip cleanly instead of erroring.
 */
export function isPersistedBenchmarkId(id: number | null | undefined): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}
