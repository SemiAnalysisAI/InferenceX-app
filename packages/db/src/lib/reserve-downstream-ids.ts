import type { Sql } from '../etl/db-utils.js';
import { DOWNSTREAM_ID_START, RESERVED_ID_TABLES } from './downstream-ids.js';

export function reserveDownstreamIds(sql: Sql): Promise<string[]> {
  return sql.begin(async (tx) => {
    const pending: string[] = [];
    for (const table of RESERVED_ID_TABLES) {
      const [state] = await tx<{ sequence: string; start: string; lowest: string | null }[]>`
        select seq.name as sequence,
          (select s.start_value::text from pg_sequences s
            where quote_ident(s.schemaname) || '.' || quote_ident(s.sequencename) = seq.name
          ) as start,
          (select min(id)::text from ${tx(table)}) as lowest
        from (select pg_get_serial_sequence(${table}, 'id') as name) seq
      `;
      if (!state?.sequence) throw new Error(`${table}.id has no sequence`);
      if (Number(state.start) >= DOWNSTREAM_ID_START) continue;
      if (state.lowest !== null) {
        throw new Error(
          `${table} already holds ids below ${DOWNSTREAM_ID_START} (lowest ${state.lowest}). ` +
            'A downstream database must hold only its own runs, reserved before its first ingest.',
        );
      }
      pending.push(state.sequence);
    }
    for (const sequence of pending) {
      await tx.unsafe(`alter sequence ${sequence} start with ${DOWNSTREAM_ID_START} restart`);
    }
    return pending;
  });
}
