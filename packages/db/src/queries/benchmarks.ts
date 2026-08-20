import type { DbClient } from '../connection.js';
import type { WorkerPower } from '../etl/benchmark-mapper.js';
export type { WorkerPower } from '../etl/benchmark-mapper.js';

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
  /** Producer-generated identity for the complete recipe; null on legacy rows. */
  recipe_fingerprint?: string | null;
  metrics: Record<string, number>;
  /**
   * Per-worker measured-power breakdown emitted on multinode / disagg runs.
   * Stored in the dedicated `workers` JSONB column on `benchmark_results`
   * (added in migration 006). Null for single-node runs and any run predating
   * aggregate_power.py's multinode patch — surfaced as undefined here.
   */
  workers?: BenchmarkWorkerRow[];
  date: string;
  /** Producer identity and timestamp; preserved for per-point provenance. */
  workflow_run_id?: number;
  run_started_at?: string | null;
  run_url: string | null;
  /** Logical snapshot identity. Set when an append-only run carries older points forward. */
  curve_date?: string;
  curve_workflow_run_id?: number;
  curve_run_started_at?: string | null;
}

const SQL_PIECE = Symbol('sql-piece');

interface SqlPiece {
  readonly [SQL_PIECE]: true;
  readonly strings: string[];
  readonly values: unknown[];
}

/**
 * Compose static SQL fragments before invoking a database driver. The final
 * DbClient call receives one ordinary TemplateStringsArray plus bound values;
 * neither Neon HTTP nor postgres.js has to interpret driver-specific fragments.
 */
function sqlPiece(strings: TemplateStringsArray, ...values: unknown[]): SqlPiece {
  const composedStrings = [strings[0] ?? ''];
  const composedValues: unknown[] = [];

  for (const [index, value] of values.entries()) {
    if (typeof value === 'object' && value !== null && SQL_PIECE in value) {
      const piece = value as SqlPiece;
      composedStrings[composedStrings.length - 1] += piece.strings[0] ?? '';
      for (const [pieceIndex, pieceValue] of piece.values.entries()) {
        composedValues.push(pieceValue);
        composedStrings.push(piece.strings[pieceIndex + 1] ?? '');
      }
      composedStrings[composedStrings.length - 1] += strings[index + 1] ?? '';
    } else {
      composedValues.push(value);
      composedStrings.push(strings[index + 1] ?? '');
    }
  }

  return {
    [SQL_PIECE]: true,
    strings: composedStrings,
    values: composedValues,
  };
}

function executeSqlPiece(sql: DbClient, piece: SqlPiece) {
  const strings = [...piece.strings] as unknown as TemplateStringsArray;
  Object.defineProperty(strings, 'raw', { value: [...piece.strings] });
  return sql(strings, ...piece.values);
}

type RecursiveBenchmarkVariant =
  | {
      kind: 'latest';
      date: string;
      exact: boolean;
      asOfRunId?: number;
    }
  | {
      kind: 'run';
      githubRunId: number;
    }
  | {
      kind: 'history';
      isl: number | null;
      osl: number | null;
      benchmarkType?: string;
    };

interface RecursiveBenchmarkPlan {
  runLineFilter: SqlPiece;
  seed: SqlPiece;
  pointIdentity: SqlPiece;
  pointOrder: SqlPiece;
  metricsExpression: SqlPiece;
  resultOrder: SqlPiece;
}

function curveRunBase(modelKeys: string[], runLineFilter: SqlPiece): SqlPiece {
  return sqlPiece`
    run_lines AS (
      SELECT
        c.model, c.hardware, c.framework, c.precision, c.disagg,
        CASE WHEN br.benchmark_type = 'agentic_traces' THEN '' ELSE c.spec_method END AS line_spec_method,
        br.benchmark_type, br.isl, br.osl, br.offload_mode,
        br.workflow_run_id, br.date, wr.run_started_at, wr.github_run_id,
        wr.append_only, min(br.image) AS image,
        count(DISTINCT br.image) AS image_count,
        bool_and(br.image IS NOT NULL) AS images_complete
      FROM benchmark_results br
      JOIN configs c ON c.id = br.config_id
      JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
      WHERE c.model = ANY(${modelKeys})
        ${runLineFilter}
        AND br.error IS NULL
      GROUP BY
        c.model, c.hardware, c.framework, c.precision, c.disagg,
        CASE WHEN br.benchmark_type = 'agentic_traces' THEN '' ELSE c.spec_method END,
        br.benchmark_type, br.isl, br.osl, br.offload_mode,
        br.workflow_run_id, br.date, wr.run_started_at, wr.github_run_id, wr.append_only
    ), ranked_runs AS (
      SELECT run_lines.*,
        row_number() OVER (
          PARTITION BY
            model, hardware, framework, precision, disagg, line_spec_method,
            benchmark_type, isl, osl, offload_mode
          ORDER BY date DESC, run_started_at DESC NULLS LAST, workflow_run_id DESC
        ) AS run_rank
      FROM run_lines
    )`;
}

const CURVE_RECURSION = sqlPiece`
  UNION ALL

  SELECT
    older.*,
    current.root_image,
    current.snapshot_date,
    current.snapshot_workflow_run_id
  FROM curve_runs current
  JOIN ranked_runs older
    ON older.model = current.model
    AND older.hardware = current.hardware
    AND older.framework = current.framework
    AND older.precision = current.precision
    AND older.disagg = current.disagg
    AND older.line_spec_method = current.line_spec_method
    AND older.benchmark_type = current.benchmark_type
    AND older.isl IS NOT DISTINCT FROM current.isl
    AND older.osl IS NOT DISTINCT FROM current.osl
    AND older.offload_mode = current.offload_mode
    AND older.run_rank = current.run_rank + 1
  WHERE current.append_only
    AND current.image_count = 1
    AND current.images_complete
    AND older.image_count = 1
    AND older.images_complete
    AND older.image = current.root_image`;

const CURVE_POINT_SOURCE = sqlPiece`
  FROM curve_runs cr
  JOIN benchmark_results br
    ON br.workflow_run_id = cr.workflow_run_id
    AND br.benchmark_type = cr.benchmark_type
    AND br.isl IS NOT DISTINCT FROM cr.isl
    AND br.osl IS NOT DISTINCT FROM cr.osl
    AND br.offload_mode = cr.offload_mode
  JOIN configs point_c
    ON point_c.id = br.config_id
    AND point_c.model = cr.model
    AND point_c.hardware = cr.hardware
    AND point_c.framework = cr.framework
    AND point_c.precision = cr.precision
    AND point_c.disagg = cr.disagg
    AND CASE WHEN br.benchmark_type = 'agentic_traces' THEN '' ELSE point_c.spec_method END = cr.line_spec_method
  WHERE br.error IS NULL`;

function executeRecursiveBenchmarkQuery(
  sql: DbClient,
  modelKeys: string[],
  plan: RecursiveBenchmarkPlan,
) {
  const query = sqlPiece`
    WITH RECURSIVE
    ${curveRunBase(modelKeys, plan.runLineFilter)},
    ${plan.seed}
    ${CURVE_RECURSION}
    ), selected_points AS (
      SELECT DISTINCT ON (
        ${plan.pointIdentity}
      ) br.*, cr.snapshot_date, cr.snapshot_workflow_run_id
      ${CURVE_POINT_SOURCE}
      ORDER BY
        ${plan.pointOrder}
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
      br.recipe_fingerprint,
      ${plan.metricsExpression},
      br.workers,
      br.date::text,
      br.workflow_run_id,
      wr.run_started_at::text,
      CASE WHEN wr.html_url IS NOT NULL THEN wr.html_url || '/attempts/' || wr.run_attempt ELSE NULL END AS run_url,
      br.snapshot_date::text AS curve_date,
      br.snapshot_workflow_run_id AS curve_workflow_run_id,
      snapshot_wr.run_started_at::text AS curve_run_started_at
    FROM selected_points br
    JOIN configs c ON c.id = br.config_id
    JOIN latest_workflow_runs wr ON wr.id = br.workflow_run_id
    JOIN latest_workflow_runs snapshot_wr ON snapshot_wr.id = br.snapshot_workflow_run_id
    ORDER BY ${plan.resultOrder}
  `;
  return executeSqlPiece(sql, query);
}

function queryRecursiveBenchmarks(
  sql: DbClient,
  modelKeys: string[],
  variant: RecursiveBenchmarkVariant,
) {
  const pointIdentity = sqlPiece`
    br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
    br.recipe_fingerprint, br.conc`;
  const pointOrder = sqlPiece`
    br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
    br.recipe_fingerprint, br.conc, cr.run_rank`;
  const rawMetrics = sqlPiece`br.metrics`;

  switch (variant.kind) {
    case 'latest': {
      const datePredicate = variant.exact
        ? sqlPiece`r.date = ${variant.date}::date`
        : sqlPiece`r.date <= ${variant.date}::date`;
      const asOfPredicate =
        !variant.exact && variant.asOfRunId !== undefined
          ? sqlPiece`AND (
              r.run_started_at IS NULL
              OR r.run_started_at <= COALESCE(
                (SELECT lwr.run_started_at FROM latest_workflow_runs lwr WHERE lwr.github_run_id = ${variant.asOfRunId}),
                'infinity'::timestamptz
              )
            )`
          : sqlPiece``;
      const seed = sqlPiece`
        seed_runs AS (
          SELECT DISTINCT ON (
            r.model, r.hardware, r.framework, r.precision, r.disagg,
            r.line_spec_method, r.benchmark_type, r.isl, r.osl, r.offload_mode
          )
            r.*
          FROM ranked_runs r
          WHERE ${datePredicate}
            ${asOfPredicate}
          ORDER BY
            r.model, r.hardware, r.framework, r.precision, r.disagg,
            r.line_spec_method, r.benchmark_type, r.isl, r.osl, r.offload_mode,
            r.date DESC, r.run_started_at DESC NULLS LAST, r.workflow_run_id DESC
        ), curve_runs AS (
          SELECT
            seed_runs.*,
            seed_runs.image AS root_image,
            seed_runs.date AS snapshot_date,
            seed_runs.workflow_run_id AS snapshot_workflow_run_id
          FROM seed_runs`;
      return executeRecursiveBenchmarkQuery(sql, modelKeys, {
        runLineFilter: sqlPiece``,
        seed,
        pointIdentity,
        pointOrder,
        metricsExpression: rawMetrics,
        resultOrder: sqlPiece`br.config_id, br.conc, br.isl, br.osl`,
      });
    }
    case 'run': {
      const seed = sqlPiece`
        curve_runs AS (
          SELECT
            ranked_runs.*,
            ranked_runs.image AS root_image,
            ranked_runs.date AS snapshot_date,
            ranked_runs.workflow_run_id AS snapshot_workflow_run_id
          FROM ranked_runs
          WHERE github_run_id = ${variant.githubRunId}`;
      return executeRecursiveBenchmarkQuery(sql, modelKeys, {
        runLineFilter: sqlPiece``,
        seed,
        pointIdentity,
        pointOrder,
        metricsExpression: rawMetrics,
        resultOrder: sqlPiece`br.config_id, br.conc, br.isl, br.osl, br.offload_mode`,
      });
    }
    case 'history': {
      const runLineFilter =
        variant.benchmarkType === 'agentic_traces'
          ? sqlPiece`AND br.benchmark_type = 'agentic_traces'`
          : sqlPiece`AND br.isl = ${variant.isl} AND br.osl = ${variant.osl}`;
      const seed = sqlPiece`
        curve_runs AS (
          SELECT
            ranked_runs.*,
            ranked_runs.image AS root_image,
            ranked_runs.date AS snapshot_date,
            ranked_runs.workflow_run_id AS snapshot_workflow_run_id
          FROM ranked_runs`;
      return executeRecursiveBenchmarkQuery(sql, modelKeys, {
        runLineFilter,
        seed,
        pointIdentity: sqlPiece`
          cr.snapshot_workflow_run_id,
          br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
          br.recipe_fingerprint, br.conc`,
        pointOrder: sqlPiece`
          cr.snapshot_workflow_run_id,
          br.config_id, br.benchmark_type, br.isl, br.osl, br.offload_mode,
          br.recipe_fingerprint, br.conc, cr.run_rank`,
        metricsExpression: sqlPiece`br.metrics - '{std_ttft,std_tpot,std_e2el,std_intvty,std_itl,mean_ttft,mean_tpot,mean_e2el,mean_intvty,mean_itl}'::text[] AS metrics`,
        resultOrder: sqlPiece`br.snapshot_date, c.id, br.conc`,
      });
    }
  }
}

/**
 * Fetch the latest benchmark results for one or more model DB keys across ALL sequences,
 * up to a given date. Multiple keys support point-release grouping — e.g. passing
 * `['glm5', 'glm5.1']` unions both buckets under the one display.
 *
 * Selection unit is the LINE, not the point. Normally each line comes entirely from
 * its newest workflow run. Runs explicitly marked append-only are the sole exception:
 * their new points extend the immediately preceding same-image curve, including a
 * consecutive chain of append-only runs back to the nearest full snapshot.
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
    // The latest variant chooses one seed per line under the requested cutoff.
    // Its recursive history remains unrestricted so an append-only seed can
    // still reach the nearest earlier full same-image snapshot.
    const rows = await queryRecursiveBenchmarks(sql, modelKeys, {
      kind: 'latest',
      date,
      exact: exact ?? false,
      asOfRunId: !exact && asOfRunId ? Number(asOfRunId) : undefined,
    });
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
      lb.recipe_fingerprint,
      lb.metrics,
      lb.workers,
      lb.date::text,
      lb.workflow_run_id,
      wr.run_started_at::text,
      CASE WHEN wr.html_url IS NOT NULL THEN wr.html_url || '/attempts/' || wr.run_attempt ELSE NULL END AS run_url,
      lb.snapshot_date::text AS curve_date,
      lb.snapshot_workflow_run_id AS curve_workflow_run_id,
      snapshot_wr.run_started_at::text AS curve_run_started_at
    FROM latest_benchmarks lb
    JOIN configs c ON c.id = lb.config_id
    JOIN latest_workflow_runs wr ON wr.id = lb.workflow_run_id
    JOIN latest_workflow_runs snapshot_wr ON snapshot_wr.id = lb.snapshot_workflow_run_id
    WHERE c.model = ANY(${modelKeys})
    ORDER BY lb.config_id, lb.conc, lb.isl, lb.osl, lb.date DESC
  `;
  return rows as unknown as BenchmarkRow[];
}

/**
 * Fetch the curve snapshot represented by one workflow run. Ordinary runs return
 * exactly their own points; append-only runs also include the immediately preceding
 * same-image curve chain. Used by GPU comparison for same-day run snapshots.
 */
export async function getBenchmarksForRun(
  sql: DbClient,
  modelKey: string | string[],
  githubRunId: string | number,
): Promise<BenchmarkRow[]> {
  const modelKeys = Array.isArray(modelKey) ? modelKey : [modelKey];
  const rows = await queryRecursiveBenchmarks(sql, modelKeys, {
    kind: 'run',
    githubRunId: Number(githubRunId),
  });
  return rows as unknown as BenchmarkRow[];
}

/** Fetch every logical curve snapshot across time for historical views. */
export async function getAllBenchmarksForHistory(
  sql: DbClient,
  modelKey: string | string[],
  isl: number | null,
  osl: number | null,
  benchmarkType?: string,
): Promise<BenchmarkRow[]> {
  const modelKeys = Array.isArray(modelKey) ? modelKey : [modelKey];
  const rows = await queryRecursiveBenchmarks(sql, modelKeys, {
    kind: 'history',
    isl,
    osl,
    benchmarkType,
  });
  return rows as unknown as BenchmarkRow[];
}
