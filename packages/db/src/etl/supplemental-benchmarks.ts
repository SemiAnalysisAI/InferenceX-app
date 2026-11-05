import type { Sql } from './db-utils';
import { createConfigCache } from './config-cache';
import { createWorkflowRunServices } from './workflow-run';
import {
  hwToGpuKey,
  normalizeFramework,
  normalizeSpecMethod,
  parseBool,
  resolveModelKey,
} from './normalizers';
import {
  bulkIngestBenchmarkRows,
  bulkUpsertAvailability,
  type BenchmarkPersistenceInput,
} from './benchmark-ingest';
import {
  extractPowerAudit,
  extractPowerInvalidReasons,
  normalizePowerContractMetrics,
  scrubWithheldPowerMetrics,
} from './benchmark-mapper';

export interface SupplementalBenchmark {
  model: string;
  hw: string;
  framework: string;
  precision: string;
  spec_decoding?: string;
  dp_attention?: string;
  tp: number;
  ep: number;
  /** Chips serving the point; defaults to tp * ep. */
  num_gpu?: number;
  conc: number;
  isl: number;
  osl: number;
  image?: string | null;
  disagg?: boolean;
  is_multinode?: boolean;
  prefill_num_workers?: number;
  decode_num_workers?: number;
  metrics: Record<string, number>;
  power_invalid_reasons?: unknown;
  power_audit?: unknown;
}

/** Results published outside CI, stored as one synthetic workflow run per snapshot. */
export interface SupplementalSnapshot {
  /** Negative, so it never collides with a GitHub run id or the eval run (0). */
  github_run_id: number;
  name: string;
  date: string;
  /** Source page; stored as the run URL as-is. */
  html_url?: string | null;
  rows: SupplementalBenchmark[];
}

export async function ingestSupplementalSnapshots(
  sql: Sql,
  snapshots: readonly SupplementalSnapshot[],
): Promise<{ newCount: number; dupCount: number }> {
  const { getOrCreateConfig } = createConfigCache(sql);
  const { getOrCreateWorkflowRun } = createWorkflowRunServices(sql);
  let newCount = 0;
  let dupCount = 0;

  for (const snapshot of snapshots) {
    if (snapshot.github_run_id >= 0) {
      throw new Error(`${snapshot.name}: github_run_id must be negative`);
    }
    const workflowRunId = (await getOrCreateWorkflowRun({
      githubRunId: snapshot.github_run_id,
      name: snapshot.name,
      date: snapshot.date,
      createdAt: `${snapshot.date}T00:00:00Z`,
      status: 'completed',
      conclusion: 'success',
      htmlUrl: snapshot.html_url ?? null,
    }))!;

    const rows: BenchmarkPersistenceInput[] = [];
    const availability: Parameters<typeof bulkUpsertAvailability>[1] = [];
    for (const entry of snapshot.rows) {
      const model = resolveModelKey({ model: entry.model, model_prefix: entry.model });
      const hardware = hwToGpuKey(entry.hw);
      if (!model || !hardware) {
        throw new Error(`${snapshot.name}: unknown model or hardware ${entry.model} ${entry.hw}`);
      }
      const { framework, disagg: frameworkDisagg } = normalizeFramework(
        entry.framework,
        entry.disagg,
      );
      const specMethod = normalizeSpecMethod(entry.spec_decoding);
      const dpAttn = parseBool(entry.dp_attention);
      const disagg = frameworkDisagg || (entry.decode_num_workers ?? 0) > 0;
      const chips = entry.num_gpu ?? entry.tp * entry.ep;

      const configId = await getOrCreateConfig({
        hardware,
        framework,
        model,
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
        numPrefillGpu: chips,
        numDecodeGpu: chips,
      });

      const metrics = { ...entry.metrics };
      normalizePowerContractMetrics(metrics, metrics);
      scrubWithheldPowerMetrics(metrics);
      rows.push({
        configId,
        benchmarkType: 'single_turn',
        offloadMode: 'off',
        isl: entry.isl,
        osl: entry.osl,
        conc: entry.conc,
        image: entry.image ?? null,
        recipeFingerprint: null,
        metrics,
        powerInvalidReasons: extractPowerInvalidReasons(entry.power_invalid_reasons),
        powerAudit: extractPowerAudit(entry.power_audit),
      });
      availability.push({
        model,
        isl: entry.isl,
        osl: entry.osl,
        precision: entry.precision,
        hardware,
        framework,
        specMethod,
        disagg,
        benchmarkType: 'single_turn',
      });
    }

    const counts = await bulkIngestBenchmarkRows(sql, rows, workflowRunId, snapshot.date);
    newCount += counts.newCount;
    dupCount += counts.dupCount;
    await bulkUpsertAvailability(sql, availability, snapshot.date);
  }

  return { newCount, dupCount };
}
