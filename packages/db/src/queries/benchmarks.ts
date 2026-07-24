import type { DbClient } from '../connection.js';
import type { WorkerPower } from '../etl/benchmark-mapper.js';

/**
 * One entry in `BenchmarkRow.workers` — mirrors the runner's aggregate_power.py
 * per-worker payload. Structurally identical to the ingest-side {@link WorkerPower},
 * so it is aliased to that single definition rather than redeclared, keeping the
 * shape from drifting within this package. The read side keeps the
 * `BenchmarkWorkerRow` name used by `BenchmarkRow.workers`.
 */
export type BenchmarkWorkerRow = WorkerPower;

export interface BenchmarkRow {
  /** Stable benchmark_results id used for agentic detail lookups. */
  id: number;
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  is_multinode: boolean;
  prefill_tp: number;
  prefill_ep: number;
  prefill_dp_attention: boolean;
  prefill_num_workers: number;
  decode_tp: number;
  decode_ep: number;
  decode_dp_attention: boolean;
  decode_num_workers: number;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  benchmark_type: string;
  isl: number | null;
  osl: number | null;
  conc: number;
  offload_mode: string;
  image: string | null;
  metrics: Record<string, number>;
  /**
   * Per-worker measured-power breakdown emitted on multinode / disagg runs.
   * Stored in the dedicated `workers` JSONB column on `benchmark_results`
   * (added in migration 006). Null for single-node runs and any run predating
   * aggregate_power.py's multinode patch — surfaced as undefined here.
   */
  workers?: BenchmarkWorkerRow[];
  date: string;
  run_url: string | null;
}

/**
 * Fetch the latest benchmark results for one or more model DB keys across ALL sequences,
 * up to a given date. Multiple keys support point-release grouping — e.g. passing
 * `['glm5', 'glm5.1']` unions both buckets under the one display.
 *
 * Selection unit is the LINE, not the point: for each line
 * `(config_id, benchmark_type, isl, osl, offload_mode)` we pick the single newest workflow run that
 * produced data for it (newest date, then latest sweep, then highest run id) and return
 * EVERY concurrency that one run measured — and nothing from any other run. A partial
 * re-sweep therefore truncates the line to its own concurrencies rather than stitching the
 * skipped ones from an older run. This guarantees a line never mixes runs/dates.
 *
 * The frontend filters by sequence client-side. This eliminates API round-trips when
 * switching sequences — the data is already cached by React Query.
 */
export async function getLatestBenchmarks(
  sql: DbClient,
  modelKey: string | string[],
  date?: string,
  exact?: boolean,
  /**
   * GitHub run id to view the chart "as of" — restricts results to runs that
   * started no later than this one, so selecting an earlier same-day run shows
   * the state of the data at that point in time (later runs don't render yet).
   * No-op when this is the latest run (the filter then includes everything).
   * Only applied on the date-filtered (non-`exact`) path used by the main chart.
   */
  asOfRunId?: string,
): Promise<BenchmarkRow[]> {
  const modelKeys = Array.isArray(modelKey) ? modelKey : [modelKey];
  if (date) {
    // Date-filtered: use the base table (the view only has the absolute latest).
    // exact=true: only this exact date (GPU comparison); exact=false (default): as of this date.
    const dateFilter = exact ? sql`br.date = ${date}::date` : sql`br.date <= ${date}::date`;
    // "As of run" filter (main chart only): keep results whose run started no later
    // than the selected run. run_started_at is an absolute timestamp, so this also
    // naturally includes all earlier-date runs. NULLs (pre-migration-003 runs that
    // lack the timestamp) are kept so old history doesn't blank out; COALESCE to
    // infinity makes an unknown asOfRunId a no-op rather than excluding everything.
    const runFilter =
      !exact && asOfRunId
        ? sql`AND (
            wr.run_started_at IS NULL
            OR wr.run_started_at <= COALESCE(
              (SELECT lwr.run_started_at FROM latest_workflow_runs lwr WHERE lwr.github_run_id = ${Number(asOfRunId)}),
              'infinity'::timestamptz
            )
          )`
        : sql``;
    // winners: the single newest run per LINE
    // (config_id, benchmark_type, isl, osl, offload_mode) under the
    // date/run cutoff. br.date is a calendar day, so two same-day sweeps tie on date — break
    // by wr.run_started_at (latest sweep wins), then br.workflow_run_id so exactly one run wins
    // even when run_started_at is equal/null. The outer join then pulls EVERY concurrency that
    // winning run measured for the line, so the line is built from one run only (no carry-forward
    // of concurrencies a partial re-sweep skipped).
    const rows = await sql`
      WITH winners AS (
        SELECT DISTINCT ON (br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode)
          br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
          br.workflow_run_id AS winning_run_id
        FROM benchmark_results br
        JOIN configs c ON c.id = br.config_id
        JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
        WHERE c.model = ANY(${modelKeys})
          AND br.error IS NULL
          AND ${dateFilter}
          ${runFilter}
        ORDER BY br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
                 br.date DESC, wr.run_started_at DESC NULLS LAST, br.workflow_run_id DESC
      )
      SELECT
        br.id,
        c.hardware,
        c.framework,
        c.model,
        c.precision,
        c.spec_method,
        c.disagg,
        c.is_multinode,
        c.prefill_tp,
        c.prefill_ep,
        c.prefill_dp_attention,
        c.prefill_num_workers,
        c.decode_tp,
        c.decode_ep,
        c.decode_dp_attention,
        c.decode_num_workers,
        c.num_prefill_gpu,
        c.num_decode_gpu,
        br.benchmark_type,
        br.offload_mode,
        br.isl,
        br.osl,
        br.conc,
        br.image,
        br.metrics,
        br.workers,
        br.date::text,
        CASE WHEN wr.html_url IS NOT NULL THEN wr.html_url || '/attempts/' || wr.run_attempt ELSE NULL END AS run_url
      FROM benchmark_results br
      JOIN configs c ON c.id = br.config_id
      JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
      JOIN winners w
        ON w.config_id = br.config_id
        AND w.benchmark_type = br.benchmark_type
        AND w.isl IS NOT DISTINCT FROM br.isl
        AND w.osl IS NOT DISTINCT FROM br.osl
        AND w.offload_mode = br.offload_mode
        AND w.winning_run_id = br.workflow_run_id
      WHERE br.error IS NULL
      ORDER BY br.config_id, br.conc, br.isl, br.osl
    `;
    return rows as unknown as BenchmarkRow[];
  }

  // No date filter: use materialized view for instant lookups
  const rows = await sql`
    SELECT
      lb.id,
      c.hardware,
      c.framework,
      c.model,
      c.precision,
      c.spec_method,
      c.disagg,
      c.is_multinode,
      c.prefill_tp,
      c.prefill_ep,
      c.prefill_dp_attention,
      c.prefill_num_workers,
      c.decode_tp,
      c.decode_ep,
      c.decode_dp_attention,
      c.decode_num_workers,
      c.num_prefill_gpu,
      c.num_decode_gpu,
      lb.benchmark_type,
      lb.offload_mode,
      lb.isl,
      lb.osl,
      lb.conc,
      lb.image,
      lb.metrics,
      lb.workers,
      lb.date::text,
      CASE WHEN wr.html_url IS NOT NULL THEN wr.html_url || '/attempts/' || wr.run_attempt ELSE NULL END AS run_url
    FROM latest_benchmarks lb
    JOIN configs c ON c.id = lb.config_id
    JOIN latest_workflow_runs wr ON wr.id = lb.workflow_run_id
    WHERE c.model = ANY(${modelKeys})
    ORDER BY lb.config_id, lb.conc, lb.isl, lb.osl, lb.date DESC
  `;
  return rows as unknown as BenchmarkRow[];
}

/**
 * Fetch the benchmark results produced by ONE specific workflow run (by GitHub
 * run id). Unlike {@link getLatestBenchmarks}, this returns exactly what that run
 * measured — used by the GPU comparison view to plot individual same-day runs as
 * distinct series (e.g. comparing a day-zero sweep against a same-day re-sweep).
 * Returns an empty array if the run produced no results for the model.
 */
export async function getBenchmarksForRun(
  sql: DbClient,
  modelKey: string | string[],
  githubRunId: string | number,
): Promise<BenchmarkRow[]> {
  const modelKeys = Array.isArray(modelKey) ? modelKey : [modelKey];
  const rows = await sql`
    SELECT DISTINCT ON (br.config_id, br.conc, br.isl, br.osl, br.offload_mode)
      br.id,
      c.hardware,
      c.framework,
      c.model,
      c.precision,
      c.spec_method,
      c.disagg,
      c.is_multinode,
      c.prefill_tp,
      c.prefill_ep,
      c.prefill_dp_attention,
      c.prefill_num_workers,
      c.decode_tp,
      c.decode_ep,
      c.decode_dp_attention,
      c.decode_num_workers,
      c.num_prefill_gpu,
      c.num_decode_gpu,
      br.benchmark_type,
      br.offload_mode,
      br.isl,
      br.osl,
      br.conc,
      br.image,
      br.metrics,
      br.workers,
      br.date::text,
      CASE WHEN wr.html_url IS NOT NULL THEN wr.html_url || '/attempts/' || wr.run_attempt ELSE NULL END AS run_url
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE c.model = ANY(${modelKeys})
      AND br.error IS NULL
      AND wr.github_run_id = ${Number(githubRunId)}
    ORDER BY br.config_id, br.conc, br.isl, br.osl, br.offload_mode, br.date DESC
  `;
  return rows as unknown as BenchmarkRow[];
}

/**
 * Fetch ALL benchmark results for a model + sequence across ALL dates.
 * No DISTINCT ON — returns every successful result, one per (config, conc, date).
 * Used by Historical Trends and Performance Over Time features.
 */
export async function getAllBenchmarksForHistory(
  sql: DbClient,
  modelKey: string | string[],
  isl: number,
  osl: number,
): Promise<BenchmarkRow[]> {
  const modelKeys = Array.isArray(modelKey) ? modelKey : [modelKey];
  const rows = await sql`
    SELECT
      br.id,
      c.hardware,
      c.framework,
      c.model,
      c.precision,
      c.spec_method,
      c.disagg,
      c.is_multinode,
      c.prefill_tp,
      c.prefill_ep,
      c.prefill_dp_attention,
      c.prefill_num_workers,
      c.decode_tp,
      c.decode_ep,
      c.decode_dp_attention,
      c.decode_num_workers,
      c.num_prefill_gpu,
      c.num_decode_gpu,
      br.benchmark_type,
      br.offload_mode,
      br.isl,
      br.osl,
      br.conc,
      br.image,
      br.metrics - '{std_ttft,std_tpot,std_e2el,std_intvty,std_itl,mean_ttft,mean_tpot,mean_e2el,mean_intvty,mean_itl}'::text[] as metrics,
      br.workers,
      br.date::text,
      CASE WHEN wr.html_url IS NOT NULL THEN wr.html_url || '/attempts/' || wr.run_attempt ELSE NULL END AS run_url
    FROM configs c
    JOIN benchmark_results br ON br.config_id = c.id
      AND br.isl = ${isl}
      AND br.osl = ${osl}
      AND br.error IS NULL
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    WHERE c.model = ANY(${modelKeys})
    ORDER BY br.date, c.id, br.conc
  `;
  return rows as unknown as BenchmarkRow[];
}
