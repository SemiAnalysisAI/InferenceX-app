import fs from 'fs';
import path from 'path';

import { confirm, hasNoSslFlag, hasYesFlag } from './cli-utils';
import { createAdminSql } from './etl/db-utils';
import { createConfigCache } from './etl/config-cache';
import { createWorkflowRunServices } from './etl/workflow-run';
import {
  resolveModelKey,
  hwToGpuKey,
  normalizeFramework,
  normalizeSpecMethod,
  parseBool,
} from './etl/normalizers';
import { ingestEvalRow } from './etl/eval-ingest';
import {
  ingestSupplementalSnapshots,
  type SupplementalSnapshot,
} from './etl/supplemental-benchmarks';

const sql = createAdminSql({
  noSsl: hasNoSslFlag(),
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

  const data: SupplementalEval[] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
      skipped++; // oxlint-disable-line no-useless-assignment -- used after loop
      continue;
    }

    const hw = hwToGpuKey(entry.hw);
    if (!hw) {
      console.warn(`  Skipped: unknown hardware ${entry.hw}`);
      skipped++; // oxlint-disable-line no-useless-assignment -- used after loop
      continue;
    }
    const { framework, disagg } = normalizeFramework(entry.framework, undefined);
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

      const { outcome } = await ingestEvalRow(
        sql,
        configId,
        {
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
    } catch (error: any) {
      console.warn(`  Error ingesting ${entry.hw} ${entry.framework}: ${error.message}`);
      skipped++;
    }
  }

  console.log(`  Evals: ${ingested} new, ${skipped} duplicate (ON CONFLICT updates)`);
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
  const snapshots: SupplementalSnapshot[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'supplemental-bmk.json'), 'utf8'),
  );
  const { newCount, dupCount } = await ingestSupplementalSnapshots(sql, snapshots);
  console.log(
    `  Benchmarks: ${snapshots.length} snapshots, ${newCount} new, ${dupCount} duplicate (ON CONFLICT updates)`,
  );

  console.log('\n=== db:ingest:supplemental complete ===');
  console.log('  Invalidate API cache: bun run admin:cache:invalidate');
}

main()
  .catch((error) => {
    console.error('ingest-supplemental failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
