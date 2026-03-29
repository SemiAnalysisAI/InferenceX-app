import type { NeonClient } from '../connection.js';

export interface LatestImageRow {
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  spec_method: string;
  isl: number;
  osl: number;
  image: string;
  date: string;
}

/**
 * Fetch the latest non-null image tag per unique (model, hardware, framework, precision, spec_method, isl, osl).
 * Uses the latest_benchmarks materialized view for fast lookups.
 */
export async function getLatestImages(sql: NeonClient): Promise<LatestImageRow[]> {
  const rows = await sql`
    SELECT DISTINCT ON (c.model, c.hardware, c.framework, c.precision, c.spec_method, lb.isl, lb.osl)
      c.model,
      c.hardware,
      c.framework,
      c.precision,
      c.spec_method,
      lb.isl,
      lb.osl,
      lb.image,
      lb.date::text
    FROM latest_benchmarks lb
    JOIN configs c ON c.id = lb.config_id
    WHERE lb.image IS NOT NULL
    ORDER BY c.model, c.hardware, c.framework, c.precision, c.spec_method, lb.isl, lb.osl, lb.date DESC
  `;
  return rows as unknown as LatestImageRow[];
}
