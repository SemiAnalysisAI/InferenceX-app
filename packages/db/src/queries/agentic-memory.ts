import type { DbClient } from '../connection.js';
import { parseAgenticMemory, type MemoryRank, type MemoryFile } from '../lib/agentic-memory.js';
import { getServerLogChunk, getServerLogFileNames } from './server-logs.js';

export const MEMORY_LOG_CHARS = 256 * 1024;
export const MEMORY_MAX_FILES = 16;
const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

export interface AgenticMemory {
  id: number;
  model: string;
  framework: string;
  hardware: string;
  date: string;
  image: string | null;
  conc: number;
  disagg: boolean;
  ranks: MemoryRank[];
  files: { file: string; truncated: boolean }[];
  filesOmitted: number;
  status: 'reported' | 'missing' | 'unsupported';
  kvPoolTokens: number | null;
  kvUsageMaxFraction: number | null;
}

/** Bounded startup reads only. No full-log downloads or token-to-byte conversion. */
export async function getAgenticMemory(sql: DbClient, id: number): Promise<AgenticMemory | null> {
  const rows = (await sql`
    select br.id, c.model, c.framework, c.hardware, br.date::text, br.image,
      br.conc, c.disagg, br.metrics
    from benchmark_results br join configs c on c.id = br.config_id
    where br.id = ${id} and br.benchmark_type = 'agentic_traces'
  `) as unknown as {
    id: number;
    model: string;
    framework: string;
    hardware: string;
    date: string;
    image: string | null;
    conc: number;
    disagg: boolean;
    metrics: Record<string, unknown>;
  }[];
  const row = rows[0];
  if (!row) return null;
  const supported = ['vllm', 'sglang'].includes(row.framework.toLowerCase());
  const names = supported ? ((await getServerLogFileNames(sql, id)) ?? []) : [];
  // Prefer worker/server streams to benchmark-client output when a bundle is large.
  names.sort(
    (a, b) =>
      Number(!/server|worker/iu.test(a)) - Number(!/server|worker/iu.test(b)) || a.localeCompare(b),
  );
  const files: MemoryFile[] = [];
  for (const file of names.slice(0, MEMORY_MAX_FILES)) {
    const chunk = await getServerLogChunk(sql, id, 0, MEMORY_LOG_CHARS, file);
    if (chunk) files.push({ file, text: chunk.serverLog, truncated: chunk.nextOffset !== null });
  }
  const ranks = parseAgenticMemory(row.framework, files);
  const fraction = finite(row.metrics.gpu_kv_cache_usage_pct);
  return {
    id: Number(row.id),
    model: row.model,
    framework: row.framework,
    hardware: row.hardware,
    date: row.date,
    image: row.image,
    conc: row.conc,
    disagg: row.disagg,
    ranks,
    files: files.map(({ file, truncated }) => ({ file, truncated })),
    filesOmitted: Math.max(0, names.length - MEMORY_MAX_FILES),
    status: supported ? (ranks.length > 0 ? 'reported' : 'missing') : 'unsupported',
    kvPoolTokens: finite(row.metrics.kv_cache_pool_tokens),
    kvUsageMaxFraction: fraction !== null && fraction <= 1 ? fraction : null,
  };
}
