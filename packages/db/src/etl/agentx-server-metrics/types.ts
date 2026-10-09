import type { Scrape } from './scrape';

/** Server-wide scalars computed from one point's profiling-phase scrape. */
export interface ScrapeScalars {
  gpuCacheHitRate: number | null;
  cpuCacheHitRate: number | null;
  externalCacheHitRate: number | null;
  gpuKvCacheUsage: number | null;
  promptTokens: number | null;
  generationTokens: number | null;
}

export interface RoleTopology {
  tp: number;
  dpAttention: boolean;
  /** Expected worker count for a disaggregated role; null when the config does not pin it. */
  workers: number | null;
}

export interface RolePoolInput {
  /** Startup log lines per worker of this role; one worker's hosts are merged. */
  workers: readonly (readonly string[])[];
  /** Scrape series from this role's endpoints. */
  scrape: Scrape;
  topology: RoleTopology;
}

/**
 * One inference server. Adding a server means one file implementing this,
 * one registry entry in `index.ts`, and its test.
 */
export interface EngineParser {
  /**
   * What `rolePool` reads from worker logs, as regex sources valid in both
   * PostgreSQL and JavaScript so multi-GiB logs are filtered in SQL: whole
   * startup lines containing one of `logLines`, and `key=<int>` argument
   * tokens for `logTokens` keys wherever they appear.
   */
  logLines: readonly string[];
  logTokens: readonly string[];
  scrape: (scrape: Scrape) => ScrapeScalars;
  /** KV-cache pool of all workers of one role in tokens, or why it is unknown. */
  rolePool: (input: RolePoolInput) => number | string;
}

/** Sum per-worker pools after checking every expected worker logged one. */
export function sumWorkerPools(
  { workers, topology }: RolePoolInput,
  workerPool: (lines: readonly string[]) => number | string,
): number | string {
  if (workers.length === 0) return 'no worker log';
  if (topology.workers !== null && workers.length !== topology.workers) {
    return `${workers.length} of ${topology.workers} worker logs`;
  }
  let total = 0;
  for (const lines of workers) {
    const pool = workerPool(lines);
    if (typeof pool === 'string') return pool;
    total += pool;
  }
  return total;
}
