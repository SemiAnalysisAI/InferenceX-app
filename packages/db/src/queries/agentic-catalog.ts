import type { DbClient } from '../connection.js';

export interface AgenticCatalogEntry {
  id: number;
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  points: number;
  minConc: number;
  maxConc: number;
  latestDate: string;
}

/** One catalog entry per database, plus the throughput that ranks its representative point. */
export interface AgenticCatalogGroup extends AgenticCatalogEntry {
  tputPerGpu: number | null;
}

/** Every traced point across `dbs`, one entry per model, hardware, framework, and precision. */
export async function getAgenticCatalog(dbs: readonly DbClient[]): Promise<AgenticCatalogEntry[]> {
  return mergeAgenticCatalogGroups(await Promise.all(dbs.map(readAgenticCatalogGroups)));
}

/** Ranks representatives as the query does: latest date, then throughput, then lowest id. */
function outranks(a: AgenticCatalogGroup, b: AgenticCatalogGroup): boolean {
  if (a.latestDate !== b.latestDate) return a.latestDate > b.latestDate;
  if (a.tputPerGpu !== b.tputPerGpu) {
    if (a.tputPerGpu === null || b.tputPerGpu === null) return b.tputPerGpu === null;
    return a.tputPerGpu > b.tputPerGpu;
  }
  return a.id < b.id;
}

/** Combine catalogs of databases that hold disjoint sets of traced points. */
export function mergeAgenticCatalogGroups(
  parts: readonly (readonly AgenticCatalogGroup[])[],
): AgenticCatalogEntry[] {
  const merged = new Map<string, AgenticCatalogGroup>();
  for (const part of parts) {
    for (const group of part) {
      const key = JSON.stringify([group.model, group.hardware, group.framework, group.precision]);
      const seen = merged.get(key);
      if (!seen) {
        merged.set(key, group);
        continue;
      }
      const representative = outranks(group, seen) ? group : seen;
      merged.set(key, {
        ...representative,
        points: seen.points + group.points,
        minConc: Math.min(seen.minConc, group.minConc),
        maxConc: Math.max(seen.maxConc, group.maxConc),
      });
    }
  }
  return [...merged.values()].map(({ tputPerGpu: _tputPerGpu, ...entry }) => entry);
}

async function readAgenticCatalogGroups(sql: DbClient): Promise<AgenticCatalogGroup[]> {
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
      where (atr.profile_export_jsonl_gz is not null or atr.profile_export_chunk_count > 0)
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
           points, min_conc, max_conc, latest_date, tput_per_gpu
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
    tput_per_gpu: number | null;
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
    tputPerGpu: r.tput_per_gpu === null ? null : Number(r.tput_per_gpu),
  }));
}
