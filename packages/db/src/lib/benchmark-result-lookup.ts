/**
 * Resolve persisted `benchmark_results` ids for raw artifact rows that were
 * mapped through the production mapper. Shared by the sidecar backfills
 * (server logs, gpu_metrics) so every historical attachment uses the same
 * natural-key match as the CI ingest path.
 */

import fs from 'node:fs';
import path from 'node:path';

import { mapBenchmarkRow, type BenchmarkParams } from '../etl/benchmark-mapper.js';
import { createSkipTracker } from '../etl/skip-tracker.js';
import type { Sql } from '../etl/db-utils.js';
import { resolveServerLogResultCandidates } from './server-log-backfill.js';

export interface BenchmarkRunSelector {
  github_run_id: number;
  run_attempt: number;
}

export async function findBenchmarkResultIds(
  sql: Sql,
  run: BenchmarkRunSelector,
  rows: readonly BenchmarkParams[],
  onUniqueFallback: (id: number) => void = () => {},
): Promise<number[]> {
  const ids = new Set<number>();
  for (const row of rows) {
    const c = row.config;
    const candidates = await sql<{ id: number; offload_mode: string }[]>`
      select br.id, br.offload_mode
      from benchmark_results br
      join workflow_runs wr on wr.id = br.workflow_run_id
      join configs cfg on cfg.id = br.config_id
      where wr.github_run_id = ${run.github_run_id}
        and wr.run_attempt = ${run.run_attempt}
        and cfg.hardware = ${c.hardware}
        and cfg.framework = ${c.framework}
        and cfg.model = ${c.model}
        and cfg.precision = ${c.precision}
        and cfg.spec_method = ${c.specMethod}
        and cfg.disagg = ${c.disagg}
        and cfg.is_multinode = ${c.isMultinode}
        and cfg.prefill_tp = ${c.prefillTp}
        and cfg.prefill_ep = ${c.prefillEp}
        and cfg.prefill_dp_attention = ${c.prefillDpAttn}
        and cfg.prefill_num_workers = ${c.prefillNumWorkers}
        and cfg.decode_tp = ${c.decodeTp}
        and cfg.decode_ep = ${c.decodeEp}
        and cfg.decode_dp_attention = ${c.decodeDpAttn}
        and cfg.decode_num_workers = ${c.decodeNumWorkers}
        and cfg.num_prefill_gpu = ${c.numPrefillGpu}
        and cfg.num_decode_gpu = ${c.numDecodeGpu}
        and br.benchmark_type = ${row.benchmarkType}
        and br.isl is not distinct from ${row.isl}
        and br.osl is not distinct from ${row.osl}
        and br.conc = ${row.conc}
        and br.recipe_fingerprint is not distinct from ${row.recipeFingerprint}
    `;
    const resolution = resolveServerLogResultCandidates(
      candidates.map((candidate) => ({
        id: Number(candidate.id),
        offloadMode: candidate.offload_mode,
      })),
      row.offloadMode,
    );
    if (resolution.usedUniqueFallback) onUniqueFallback(resolution.ids[0]!);
    for (const id of resolution.ids) ids.add(id);
  }
  return [...ids];
}

function findJsonFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const pathname = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...findJsonFiles(pathname));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(pathname);
  }
  return files.toSorted();
}

/** Map known successful rows; report unidentifiable rows separately from known failures. */
export function readMappedBenchmarkRows(
  root: string,
  onUnmapped: (error: string) => void = () => {},
): BenchmarkParams[] {
  const tracker = createSkipTracker();
  const rows: BenchmarkParams[] = [];
  for (const file of findJsonFiles(root)) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const rawRows = Array.isArray(parsed) ? parsed : [parsed];
    for (const [index, raw] of rawRows.entries()) {
      const error = `Unmappable benchmark row: ${path.relative(root, file)} row ${index + 1}`;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        onUnmapped(error);
        continue;
      }
      const failedRuns = tracker.skips.failedRun;
      const mapped = mapBenchmarkRow(raw as Record<string, unknown>, tracker);
      if (mapped) rows.push(mapped);
      else if (tracker.skips.failedRun === failedRuns) onUnmapped(error);
    }
  }
  return rows;
}
