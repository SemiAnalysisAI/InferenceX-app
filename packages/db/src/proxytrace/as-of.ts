import { sql } from 'kysely';
import { AS_OF_ISO } from './shared/as-of';

/**
 * SQL stand-ins for the wall clock, anchored at the frozen snapshot's as-of
 * time (see ./shared/as-of). Use `${NOW}` wherever a query would use now().
 */
export const NOW = sql`${AS_OF_ISO}::timestamptz`;

/** The snapshot's last (partial) UTC day, as a date. */
export const TODAY_UTC_DATE = sql`(${NOW} AT TIME ZONE 'UTC')::date`;

/** Midnight UTC at the start of the snapshot's last day, as a timestamptz. */
export const TODAY_UTC_START = sql`date_trunc('day', ${NOW} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
