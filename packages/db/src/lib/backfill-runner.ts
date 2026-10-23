import { confirm, hasYesFlag } from '../cli-utils.js';
import type { Sql } from '../etl/db-utils.js';
import { retryArtifactOperation } from './artifact-retry.js';
import { listRunArtifacts, type ArtifactMeta } from './github-artifacts.js';

export interface LimitForceFlags {
  limit: number | null;
  force: boolean;
  shardCount: number;
  shardIndex: number;
}

export function requireBackfillPayload<T>(payload: T | null, field: string): T {
  if (payload === null) {
    throw new Error(`Could not compute ${field}; existing data was not changed`);
  }
  return payload;
}

function populated(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
}

export function retainPopulatedFields<T extends object>(
  previous: T | null,
  next: T,
  fields: readonly (keyof T)[],
): void {
  for (const field of fields) {
    const before = previous?.[field];
    const after = next[field];
    if (populated(before) && !populated(after)) {
      throw new Error(`${String(field)} became empty; existing data was not changed`);
    }
  }
}

export function parseRunIdFlag(argv: readonly string[] = process.argv): number | undefined {
  const index = argv.indexOf('--run-id');
  if (index === -1) return undefined;
  const raw = argv[index + 1];
  const runId = Number(raw);
  if (!raw || !/^\d+$/u.test(raw) || !Number.isSafeInteger(runId) || runId < 1) {
    throw new Error('--run-id requires a positive integer GitHub workflow run ID');
  }
  return runId;
}

export function parseLimitForceFlags(): LimitForceFlags {
  let limit: number | null = null;
  let force = false;
  let shardCount = 1;
  let shardIndex = 0;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]!;
    if (arg === '--force') force = true;
    else if (arg === '--limit') {
      const next = process.argv[++i];
      if (!next || Number.isNaN(Number(next))) {
        console.error('--limit requires a numeric argument');
        process.exit(1);
      }
      limit = Number(next);
    } else if (arg === '--shard-count') {
      const next = process.argv[++i];
      const parsed = Number(next);
      if (!next || !Number.isInteger(parsed) || parsed < 1) {
        console.error('--shard-count requires a positive integer');
        process.exit(1);
      }
      shardCount = parsed;
    } else if (arg === '--shard-index') {
      const next = process.argv[++i];
      const parsed = Number(next);
      if (!next || !Number.isInteger(parsed) || parsed < 0) {
        console.error('--shard-index requires a non-negative integer');
        process.exit(1);
      }
      shardIndex = parsed;
    }
  }
  if (shardIndex >= shardCount) {
    console.error('--shard-index must be less than --shard-count');
    process.exit(1);
  }
  return { limit, force, shardCount, shardIndex };
}

export async function confirmProceed(candidatesLabel: string): Promise<boolean> {
  console.log(`\n  ${candidatesLabel}`);
  if (hasYesFlag()) return true;
  const ok = await confirm('\nProceed? (y/N) ');
  if (!ok) console.log('Aborted.');
  return ok;
}

export async function runPerIdBackfill(
  ids: readonly number[],
  processRow: (id: number) => Promise<'ok' | 'skipped'>,
): Promise<void> {
  let ok = 0;
  const failedIds: number[] = [];
  const t0 = Date.now();
  for (const id of ids) {
    const start = Date.now();
    try {
      if ((await processRow(id)) === 'skipped') continue;
      ok++;
      const elapsed = Math.round((Date.now() - start) / 1000);
      const elapsedTotal = Math.round((Date.now() - t0) / 1000);
      console.log(`  ✓ id=${id} (${elapsed}s, ${ok}/${ids.length} done, ${elapsedTotal}s total)`);
    } catch (error) {
      failedIds.push(id);
      console.error(`  ✗ id=${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const totalSec = Math.round((Date.now() - t0) / 1000);
  console.log(`\n=== backfill complete: ${ok} ok, ${failedIds.length} failed in ${totalSec}s ===`);
  if (failedIds.length > 0) {
    console.error(`  failed ids: ${failedIds.join(', ')}`);
    process.exitCode = 1;
  }
}

export async function runCandidateIdBackfill(
  loadCandidateIds: () => Promise<readonly number[]>,
  processRow: (id: number) => Promise<'ok' | 'skipped'>,
  formatCandidates: (count: number) => string = (count) => `${count} candidate row(s).`,
): Promise<boolean> {
  const ids = await loadCandidateIds();
  if (ids.length === 0) {
    console.log('\n  Nothing to do — all rows up to date.');
    return false;
  }
  if (!(await confirmProceed(formatCandidates(ids.length)))) return false;
  await runPerIdBackfill(ids, processRow);
  return true;
}

export function listBackfillRunArtifacts(
  repository: string,
  runId: number,
): Promise<ArtifactMeta[] | null> {
  return retryArtifactOperation(`listing GitHub artifacts for run ${runId}`, () => {
    try {
      return listRunArtifacts(repository, String(runId));
    } catch (error) {
      if (/\(HTTP 404\)/u.test(String((error as { stderr?: unknown } | null)?.stderr))) return null;
      throw error;
    }
  });
}

export function jsonbParam(sql: Sql, value: unknown): ReturnType<Sql['json']> {
  return sql.json(structuredClone(value) as unknown as Parameters<typeof sql.json>[0]);
}

export function runBackfillMain(name: string, sql: Sql, main: () => Promise<void>): void {
  main()
    .catch((error) => {
      console.error(`${name} failed:`, error);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
