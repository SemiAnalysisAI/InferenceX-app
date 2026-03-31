/**
 * Ingest supplemental data from packages/db/data/.
 * Looks for:
 *   - supplemental-evals.json  (extra eval results, currently used for gsm8k evals baseline data)
 *   - supplemental-bmk.json    (extra benchmark results)
 *
 * Usage:
 *   pnpm --filter *inferencex-db db:ingest:supplemental
 */

import fs from 'fs';
import path from 'path';

import { confirm, hasYesFlag } from './cli-utils';
import { createAdminSql, refreshLatestBenchmarks } from './etl/db-utils';
import { createConfigCache } from './etl/config-cache';
import { createWorkflowRunServices } from './etl/workflow-run';
import {
  resolveModelKey,
  hwToGpuKey,
  normalizeFramework,
  normalizeSpecMethod,
  parseBool,
} from './etl/normalizers';
import { bulkIngestBenchmarkRows, bulkUpsertAvailability } from './etl/benchmark-ingest';
import { ingestEvalRow } from './etl/eval-ingest';

const sql = createAdminSql({
  max: 5,
  idle_timeout: 60,
});

const DATA_DIR = path.join(import.meta.dirname, '..', 'data');

interface SupplementalEval {
  model: string;
  hw: string;
  framework: string;
  precision: string;
  spec_decoding: string;
  tp: number;
  ep: number;
  conc: number;
  dp_attention: string;
  task: string;
  em_strict: number;
  em_strict_se: number;
  em_flexible: number;
  em_flexible_se: number;
  n_eff: number;
  source: string;
  score: number;
  score_name: string;
  score_se: number;
  timestamp: string;
}

async function ingestSupplementalEvals(
  configCache: ReturnType<typeof createConfigCache>,
  getOrCreateWorkflowRun: ReturnType<typeof createWorkflowRunServices>['getOrCreateWorkflowRun'],
): Promise<void> {
  const filePath = path.join(DATA_DIR, 'supplemental-evals.json');
  if (!fs.existsSync(filePath)) {
    console.log('  No supplemental-evals.json found, skipping.');
    return;
  }

  const data: SupplementalEval[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  console.log(`  Loaded ${data.length} supplemental eval entries`);

  const { getOrCreateConfig } = configCache;

  const date = '2026-01-21';
  const workflowRunId = (await getOrCreateWorkflowRun({
    githubRunId: 0,
    name: 'Supplemental Eval Data',
    date,
    createdAt: '2026-01-21T00:00:00Z',
    status: 'completed',
    conclusion: 'success',
  }))!;

  let ingested = 0;
  let skipped = 0;

  for (const entry of data) {
    const modelKey = resolveModelKey({ model: entry.model, infmax_model_prefix: undefined });
    if (!modelKey) {
      console.warn(`  Skipped: unknown model ${entry.model}`);
      skipped++;
      continue;
    }

    const hw = hwToGpuKey(entry.hw);
    if (!hw) {
      console.warn(`  Skipped: unknown hardware ${entry.hw}`);
      skipped++;
      continue;
    }
    const { framework, disagg } = normalizeFramework(entry.framework, false);
    const specMethod = normalizeSpecMethod(entry.spec_decoding);
    const dpAttn = parseBool(entry.dp_attention);

    try {
      const configId = await getOrCreateConfig({
        hardware: hw,
        framework,
        model: modelKey,
        precision: entry.precision,
        specMethod,
        disagg,
        isMultinode: false,
        prefillTp: entry.tp,
        prefillEp: entry.ep,
        prefillDpAttn: dpAttn,
        prefillNumWorkers: 0,
        decodeTp: entry.tp,
        decodeEp: entry.ep,
        decodeDpAttn: dpAttn,
        decodeNumWorkers: 0,
        numPrefillGpu: entry.tp * entry.ep,
        numDecodeGpu: entry.tp * entry.ep,
      });

      const outcome = await ingestEvalRow(
        sql,
        async () => configId,
        {
          config: {} as any,
          task: entry.task,
          isl: 1024,
          osl: 8192,
          conc: entry.conc,
          lmEvalVersion: null,
          metrics: {
            em_strict: entry.em_strict,
            em_strict_se: entry.em_strict_se,
            em_flexible: entry.em_flexible,
            em_flexible_se: entry.em_flexible_se,
            n_eff: entry.n_eff,
            score: entry.score,
            score_se: entry.score_se,
          },
        },
        workflowRunId,
        date,
      );
      if (outcome === 'new') ingested++;
      else skipped++;
    } catch (err: any) {
      console.warn(`  Error ingesting ${entry.hw} ${entry.framework}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`  Evals: ${ingested} new, ${skipped} duplicate (ON CONFLICT updates)`);
}

interface SupplementalBmk {
  model: string;
  hw: string;
  framework: string;
  precision: string;
  spec_decoding: string;
  tp: number;
  ep: number;
  conc: number;
  dp_attention: string;
  isl: number;
  osl: number;
  image: string | null;
  metrics: Record<string, number>;
  date: string;
  disagg?: boolean;
  is_multinode?: boolean;
  prefill_num_workers?: number;
  decode_num_workers?: number;
}

async function ingestSupplementalBmk(
  configCache: ReturnType<typeof createConfigCache>,
  getOrCreateWorkflowRun: ReturnType<typeof createWorkflowRunServices>['getOrCreateWorkflowRun'],
): Promise<void> {
  const filePath = path.join(DATA_DIR, 'supplemental-bmk.json');
  if (!fs.existsSync(filePath)) {
    console.log('  No supplemental-bmk.json found, skipping.');
    return;
  }

  const data: SupplementalBmk[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (data.length === 0) {
    console.log('  supplemental-bmk.json is empty, skipping.');
    return;
  }
  console.log(`  Loaded ${data.length} supplemental benchmark entries`);

  const { getOrCreateConfig } = configCache;

  // Group by date for separate workflow runs
  const byDate = new Map<string, SupplementalBmk[]>();
  for (const entry of data) {
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date)!.push(entry);
  }

  let totalNew = 0;
  let totalDup = 0;

  for (const [date, entries] of byDate) {
    const workflowRunId = (await getOrCreateWorkflowRun({
      githubRunId: 0,
      name: 'Supplemental Benchmark Data',
      date,
      createdAt: `${date}T00:00:00Z`,
      status: 'completed',
      conclusion: 'success',
    }))!;

    const rows: Array<{
      configId: number;
      isl: number;
      osl: number;
      conc: number;
      image: string | null;
      metrics: Record<string, number>;
    }> = [];

    for (const entry of entries) {
      const modelKey = resolveModelKey({ model: entry.model, infmax_model_prefix: undefined });
      if (!modelKey) {
        console.warn(`  Skipped: unknown model ${entry.model}`);
        totalDup++;
        continue;
      }

      const hw = hwToGpuKey(entry.hw);
      if (!hw) {
        console.warn(`  Skipped: unknown hardware ${entry.hw}`);
        totalDup++;
        continue;
      }

      const { framework, disagg: frameworkDisagg } = normalizeFramework(
        entry.framework,
        entry.disagg ?? false,
      );
      const specMethod = normalizeSpecMethod(entry.spec_decoding);
      const dpAttn = parseBool(entry.dp_attention);
      const disagg = entry.disagg ?? frameworkDisagg;

      const configId = await getOrCreateConfig({
        hardware: hw,
        framework,
        model: modelKey,
        precision: entry.precision,
        specMethod,
        disagg,
        isMultinode: entry.is_multinode ?? false,
        prefillTp: entry.tp,
        prefillEp: entry.ep,
        prefillDpAttn: dpAttn,
        prefillNumWorkers: entry.prefill_num_workers ?? 0,
        decodeTp: entry.tp,
        decodeEp: entry.ep,
        decodeDpAttn: dpAttn,
        decodeNumWorkers: entry.decode_num_workers ?? 0,
        numPrefillGpu: entry.tp * entry.ep,
        numDecodeGpu: entry.tp * entry.ep,
      });

      rows.push({
        configId,
        isl: entry.isl,
        osl: entry.osl,
        conc: entry.conc,
        image: entry.image,
        metrics: entry.metrics,
      });
    }

    const { newCount, dupCount } = await bulkIngestBenchmarkRows(
      sql,
      rows.map((r) => ({ ...r, config: {} as any })),
      workflowRunId,
      date,
    );
    totalNew += newCount;
    totalDup += dupCount;

    // Upsert availability — only reached if bulkIngestBenchmarkRows succeeded above.
    // Entries that failed model/hw resolution were skipped via `continue` in the loop,
    // and getOrCreateConfig failures propagate (no try/catch), so `entries` that made it
    // to `rows` are exactly the valid ones.
    const availRows: Array<{
      model: string;
      isl: number;
      osl: number;
      precision: string;
      hardware: string;
      framework: string;
      specMethod: string;
      disagg: boolean;
    }> = [];
    for (const entry of entries) {
      const modelKey = resolveModelKey({ model: entry.model, infmax_model_prefix: undefined });
      const hw = hwToGpuKey(entry.hw);
      if (!modelKey || !hw) continue;
      const { framework, disagg } = normalizeFramework(entry.framework, entry.disagg ?? false);
      const specMethod = normalizeSpecMethod(entry.spec_decoding);
      availRows.push({
        model: modelKey,
        isl: entry.isl,
        osl: entry.osl,
        precision: entry.precision,
        hardware: hw,
        framework,
        specMethod,
        disagg,
      });
    }
    if (availRows.length > 0) {
      await bulkUpsertAvailability(sql, availRows, date);
    }
  }

  console.log(`  Benchmarks: ${totalNew} new, ${totalDup} duplicate (ON CONFLICT updates)`);
}

async function main(): Promise<void> {
  console.log('=== db:ingest:supplemental ===');
  console.log(`Data directory: ${DATA_DIR}\n`);

  if (!hasYesFlag()) {
    const ok = await confirm('Continue? (y/N) ');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }

  const configCache = createConfigCache(sql);
  const { getOrCreateWorkflowRun } = createWorkflowRunServices(sql);

  await configCache.preloadConfigs();
  console.log(`  ${configCache.size} configs preloaded\n`);

  await ingestSupplementalEvals(configCache, getOrCreateWorkflowRun);
  await ingestSupplementalBmk(configCache, getOrCreateWorkflowRun);

  await refreshLatestBenchmarks(sql);

  console.log('\n=== db:ingest:supplemental complete ===');
}

main()
  .catch((err) => {
    console.error('ingest-supplemental failed:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
