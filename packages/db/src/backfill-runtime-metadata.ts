/**
 * Restore runtime component metadata that older app ingest versions dropped.
 *
 * The benchmark producer began emitting nested router/offload component objects
 * and `kv_p2p_transfer` on 2026-07-13. The raw GitHub Actions benchmark
 * artifacts remain authoritative, so this script downloads only the small
 * benchmark-result artifacts and merges those metadata keys into matching DB
 * rows. It never replaces measured metrics or topology/config data.
 *
 * Usage:
 *   pnpm --filter @semianalysisai/inferencex-db db:backfill-runtime-metadata
 *   pnpm --filter @semianalysisai/inferencex-db db:backfill-runtime-metadata --yes
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { hasNoSslFlag } from './cli-utils.js';
import { mapBenchmarkRow } from './etl/benchmark-mapper.js';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils.js';
import { createSkipTracker } from './etl/skip-tracker.js';
import { downloadArtifact, listRunArtifacts } from './lib/github-artifacts.js';
import { confirmProceed, runBackfillMain } from './lib/backfill-runner.js';
import {
  repositoryFromRunUrl,
  selectBenchmarkArtifacts,
} from './lib/runtime-metadata-artifacts.js';

const REPO = 'SemiAnalysisAI/InferenceX';
const FIRST_METADATA_DATE = '2026-07-13';
const RUNTIME_KEYS = [
  'kv_offloading',
  'kv_offload_backend',
  'kv_offload_backend_version',
  'kv_p2p_transfer',
  'router_name',
  'router_version',
] as const;

const sql = createAdminSql({ noSsl: hasNoSslFlag(), max: 2, onnotice: () => {} });

function findJsonFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const pathname = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...findJsonFiles(pathname));
    else if (entry.isFile() && entry.name.endsWith('.json')) files.push(pathname);
  }
  return files;
}

async function backfillRawRow(githubRunId: number, rawRow: Record<string, unknown>) {
  const mapped = mapBenchmarkRow(rawRow, createSkipTracker());
  if (!mapped) return 'unmapped' as const;

  const metadata = Object.fromEntries(
    RUNTIME_KEYS.flatMap((key) =>
      mapped.metrics[key] === undefined ? [] : [[key, mapped.metrics[key]]],
    ),
  );
  if (Object.keys(metadata).length === 0) return 'empty' as const;

  const c = mapped.config;
  const updated = await sql<{ id: number }[]>`
    update benchmark_results br
    set metrics = br.metrics || ${sql.json(metadata)}
    from workflow_runs wr, configs cfg
    where br.workflow_run_id = wr.id
      and br.config_id = cfg.id
      and wr.github_run_id = ${githubRunId}
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
      and br.benchmark_type = ${mapped.benchmarkType}
      and br.isl is not distinct from ${mapped.isl}
      and br.osl is not distinct from ${mapped.osl}
      and br.conc = ${mapped.conc}
      and br.offload_mode = ${mapped.offloadMode}
    returning br.id
  `;
  return updated.length > 0 ? ('updated' as const) : ('missing' as const);
}

async function main(): Promise<void> {
  console.log('=== backfill-runtime-metadata ===');
  const runs = await sql<{ github_run_id: number; html_url: string | null }[]>`
    select distinct wr.github_run_id, wr.html_url
    from workflow_runs wr
    join benchmark_results br on br.workflow_run_id = wr.id
    where wr.date >= ${FIRST_METADATA_DATE}::date
    order by wr.github_run_id
  `;
  if (runs.length === 0) {
    console.log('  Nothing to do.');
    return;
  }
  if (!(await confirmProceed(`${runs.length} workflow run(s) may contain runtime metadata.`))) {
    return;
  }

  let updated = 0;
  let missing = 0;
  let empty = 0;
  let unmapped = 0;
  for (const [index, run] of runs.entries()) {
    const runId = Number(run.github_run_id);
    const repository = repositoryFromRunUrl(run.html_url) ?? REPO;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `runtime-metadata-${runId}-`));
    try {
      const artifacts = selectBenchmarkArtifacts(listRunArtifacts(repository, String(runId)));
      let files = 0;
      for (const artifact of artifacts) {
        const artifactDir = downloadArtifact(artifact, tempDir);
        for (const file of findJsonFiles(artifactDir)) {
          files++;
          const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
          const rawRows = Array.isArray(parsed) ? parsed : [parsed];
          for (const raw of rawRows) {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
            const result = await backfillRawRow(runId, raw as Record<string, unknown>);
            if (result === 'updated') updated++;
            else if (result === 'missing') missing++;
            else if (result === 'empty') empty++;
            else unmapped++;
          }
        }
      }
      console.log(
        `  [${index + 1}/${runs.length}] ${repository} run ${runId}: ` +
          `${artifacts.length} artifact(s), ${files} file(s)`,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  await refreshLatestBenchmarks(sql);
  console.log(
    `  Rows: ${updated} updated, ${empty} without runtime metadata, ` +
      `${unmapped} unmapped, ${missing} missing DB match`,
  );
  if (missing > 0) process.exitCode = 1;
}

runBackfillMain('backfill-runtime-metadata', sql, main);
