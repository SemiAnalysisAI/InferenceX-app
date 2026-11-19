import type { Sql } from '../etl/db-utils.js';
import {
  SPECULATION_LOG_PATTERN,
  type ServerLogSpeculation,
  speculationFromServerLog,
} from '../etl/server-log-speculation.js';

// Engines print their speculative config at startup; the head of each log file is enough.
const LOG_HEAD_CHARS = 40_000_000;

/** AgentX points labeled speculative whose metrics do not yet say what the server ran. */
export async function loadSpecAlgorithmCandidates(sql: Sql): Promise<number[]> {
  const rows = await sql<{ id: number }[]>`
    select br.id from benchmark_results br
    join configs c on c.id = br.config_id
    where br.benchmark_type = 'agentic_traces' and c.spec_method <> 'none'
      and br.error is null and br.server_log_id is not null
      and br.metrics ->> 'spec_algorithm' is null
    order by br.id
  `;
  return rows.map((row) => Number(row.id));
}

/** Read one point's speculative config from its stored server log and merge it into metrics. */
export async function backfillSpecAlgorithm(
  sql: Sql,
  id: number,
): Promise<ServerLogSpeculation | null> {
  const [row] = await sql<{ model: string; hits: string[] }[]>`
    select c.model,
      array(
        select distinct (regexp_matches(substr(src.t, 1, ${LOG_HEAD_CHARS}), ${`(${SPECULATION_LOG_PATTERN})`}, 'g'))[1]
        from (
          select sl.server_log as t from server_logs sl where sl.id = br.server_log_id
          union all
          select f.log_text from server_log_files f where f.server_log_id = br.server_log_id
        ) src
      ) as hits
    from benchmark_results br join configs c on c.id = br.config_id
    where br.id = ${id}
  `;
  const speculation = row ? speculationFromServerLog(row.hits.join('\n'), row.model) : null;
  if (!speculation) return null;
  await sql`
    update benchmark_results
    set metrics = metrics || ${sql.json(speculation as unknown as Record<string, string>)}
    where id = ${id}
  `;
  return speculation;
}
