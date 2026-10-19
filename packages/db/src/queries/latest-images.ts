import type { DbClient } from '../connection.js';

export interface LatestImageRow {
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  /** Null for agentic (AgentX) rows — the trace replay has no fixed sequence lengths. */
  isl: number | null;
  osl: number | null;
  /** `single_turn` for fixed-sequence rows, `agentic_traces` for AgentX rows. */
  benchmark_type: string;
  image: string;
  date: string;
}

/**
 * Fetch the latest non-null image tag per unique (model, hardware, framework, precision,
 * spec_method, disagg, benchmark_type, isl, osl). Uses the latest_benchmarks materialized view for
 * fast lookups. `benchmark_type` is part of the line key so agentic (null isl/osl) rows
 * stay distinct from fixed-sequence rows and the frontend can label them as AgentX.
 */
export async function getLatestImages(sql: DbClient): Promise<LatestImageRow[]> {
  const rows = await sql`
    SELECT DISTINCT ON (c.model, c.hardware, c.framework, c.precision, c.spec_method, c.disagg, lb.benchmark_type, lb.isl, lb.osl)
      c.model,
      c.hardware,
      c.framework,
      c.precision,
      c.spec_method,
      c.disagg,
      lb.isl,
      lb.osl,
      lb.benchmark_type,
      lb.image,
      lb.date::text
    FROM latest_benchmarks lb
    JOIN configs c ON c.id = lb.config_id
    WHERE lb.image IS NOT NULL
    ORDER BY c.model, c.hardware, c.framework, c.precision, c.spec_method, c.disagg, lb.benchmark_type, lb.isl, lb.osl, lb.date DESC
  `;
  return rows as unknown as LatestImageRow[];
}

/**
 * One successful image-bearing observation per configuration/day, plus the last
 * pre-window observation. The seed retains ages older than the 90-day window.
 * Parallelism and concurrency do not add votes to the displayed configuration.
 */
export async function getImageAgeObservations(
  sql: DbClient,
  asOf: string,
): Promise<Omit<LatestImageRow, 'image'>[]> {
  const rows = await sql`
    WITH bounds AS (
      SELECT ${asOf}::date AS end_date, ${asOf}::date - 89 AS start_date
    )
    SELECT c.model, c.hardware, c.framework, c.precision, c.spec_method, c.disagg,
      br.benchmark_type, br.isl, br.osl, max(br.date)::text AS date
    FROM benchmark_results br
    JOIN configs c ON c.id = br.config_id
    CROSS JOIN bounds
    WHERE br.error IS NULL AND br.image IS NOT NULL AND br.date <= bounds.end_date
    GROUP BY c.model, c.hardware, c.framework, c.precision, c.spec_method, c.disagg,
      br.benchmark_type, br.isl, br.osl,
      CASE WHEN br.date < bounds.start_date THEN NULL ELSE br.date END
  `;
  return rows as unknown as Omit<LatestImageRow, 'image'>[];
}
