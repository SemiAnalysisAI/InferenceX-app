import type { Sql } from '../etl/db-utils.js';
import { DOWNSTREAM_ID_START, RESERVED_ID_TABLES } from './downstream-ids.js';

/**
 * Make a downstream database assign its own run, benchmark, and eval ids from
 * `DOWNSTREAM_ID_START` up. Sequences already in the range are left alone. A
 * table holding ids below the range is refused, because those rows would
 * collide with public ids. Returns the sequences it restarted.
 */
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
      // START as well as RESTART: the app checks the start value, which any role can read.
      await tx.unsafe(`alter sequence ${sequence} start with ${DOWNSTREAM_ID_START} restart`);
    }
    return pending;
  });
}
