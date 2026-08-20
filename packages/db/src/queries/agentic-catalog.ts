/**
 * Catalog of AgentX points that have a stored telemetry blob.
 *
 * `/inference/agentic/<id>` only renders something useful when the row has an
 * `agentic_trace_replay` blob behind it, so this is the authoritative list of
 * detail pages that exist. There are hundreds of such rows — far too many to
 * list one card each — so the catalog collapses them to one entry per
 * (model, hardware, framework, precision) config and links to a representative
 * point. The detail page ships a sibling navigator, so landing on one point of
 * a config is enough to reach the rest of that config's concurrencies.
 *
 * Representative point = latest date, then highest throughput per GPU (the
 * headline point on that config's curve), with the id as a final tiebreak so
 * the choice is deterministic across requests.
 */

import type { DbClient } from '../connection.js';

export interface AgenticCatalogEntry {
  /** `benchmark_results.id` of the representative point for this config. */
  id: number;
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  /** Trace-backed points in this config, i.e. detail pages reachable from it. */
  points: number;
  /** Lowest and highest client concurrency measured with a stored trace. */
  minConc: number;
  maxConc: number;
  /** Most recent benchmark date in this config (YYYY-MM-DD). */
  latestDate: string;
}

export async function getAgenticCatalog(sql: DbClient): Promise<AgenticCatalogEntry[]> {
  const rows = (await sql`
    with traced as (
      select
        br.id,
        br.conc,
        br.date::text as date,
        c.model, c.hardware, c.framework, c.precision,
        (br.metrics->>'tput_per_gpu')::float8 as tput_per_gpu
      from benchmark_results br
      join configs c on c.id = br.config_id
      join agentic_trace_replay atr on atr.id = br.trace_replay_id
      where atr.profile_export_jsonl_gz is not null
    ),
    ranked as (
      select
        traced.*,
        count(*) over w as points,
        min(conc) over w as min_conc,
        max(conc) over w as max_conc,
        max(date) over w as latest_date,
        row_number() over (
          partition by model, hardware, framework, precision
          order by date desc, tput_per_gpu desc nulls last, id
        ) as rn
      from traced
      window w as (partition by model, hardware, framework, precision)
    )
    select id, model, hardware, framework, precision,
           points, min_conc, max_conc, latest_date
    from ranked
    where rn = 1
    order by model, hardware, framework, precision
  `) as unknown as {
    id: number;
    model: string;
    hardware: string;
    framework: string;
    precision: string;
    points: number;
    min_conc: number;
    max_conc: number;
    latest_date: string;
  }[];

  return rows.map((r) => ({
    id: Number(r.id),
    model: r.model,
    hardware: r.hardware,
    framework: r.framework,
    precision: r.precision,
    points: Number(r.points),
    minConc: Number(r.min_conc),
    maxConc: Number(r.max_conc),
    latestDate: r.latest_date,
  }));
}
