import { createHash } from 'crypto';

import type { DbClient } from '@semianalysisai/inferencex-db/connection';

const RATE_LIMIT_PER_HOUR = 5;

// Peppered (not salted — needs deterministic lookup) to defeat IPv4 rainbow tables on the readonly DB URL.
export function hashIp(ip: string, pepper: Uint8Array): string {
  return createHash('sha256').update(pepper).update(ip).digest('hex');
}

// Atomic upsert + opportunistic prune (rows expired ≥1h ago). Returns post-increment count.
export async function incrementHourlyAndGet(sql: DbClient, ipHash: string): Promise<number> {
  const rows = (await sql`
    with pruned as (
      delete from feedback_rate_limits
      where window_start < now() - interval '2 hours'
    )
    insert into feedback_rate_limits (ip_hash, count, window_start)
    values (${ipHash}, 1, now())
    on conflict (ip_hash) do update set
      count = case
        when feedback_rate_limits.window_start < now() - interval '1 hour' then 1
        else feedback_rate_limits.count + 1
      end,
      window_start = case
        when feedback_rate_limits.window_start < now() - interval '1 hour' then now()
        else feedback_rate_limits.window_start
      end
    returning count
  `) as { count: number }[];
  return rows[0]?.count ?? 0;
}

export function isRateLimited(count: number): boolean {
  return count > RATE_LIMIT_PER_HOUR;
}

export const RATE_LIMIT = RATE_LIMIT_PER_HOUR;
