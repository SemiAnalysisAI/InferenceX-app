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
 * spec_method, benchmark_type, isl, osl). Uses the latest_benchmarks materialized view for
 * fast lookups. `benchmark_type` is part of the line key so agentic (null isl/osl) rows
 * stay distinct from fixed-sequence rows and the frontend can label them as AgentX.
 */
export async function getLatestImages(sql: DbClient): Promise<LatestImageRow[]> {
  const rows = await sql`
    SELECT DISTINCT ON (c.model, c.hardware, c.framework, c.precision, c.spec_method, lb.benchmark_type, lb.isl, lb.osl)
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
    ORDER BY c.model, c.hardware, c.framework, c.precision, c.spec_method, lb.benchmark_type, lb.isl, lb.osl, lb.date DESC
  `;
  return rows as unknown as LatestImageRow[];
}
