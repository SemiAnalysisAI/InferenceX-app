import { sql } from 'kysely';
import { AS_OF_ISO } from './shared/as-of';

export const NOW = sql`${AS_OF_ISO}::timestamptz`;

export const TODAY_UTC_DATE = sql`(${NOW} AT TIME ZONE 'UTC')::date`;

export const TODAY_UTC_START = sql`date_trunc('day', ${NOW} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
