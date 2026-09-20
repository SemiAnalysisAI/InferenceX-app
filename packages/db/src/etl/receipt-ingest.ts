import fs from 'node:fs';
import path from 'node:path';
import type postgres from 'postgres';
import {
  mapReceiptPointRows,
  verifyMeasurementSnapshot,
  type MeasurementReceipt,
} from '../lib/measurement-receipt';
import type { ConfigParams } from './config-cache';
import type { EvalParams } from './eval-mapper';
import { mapEvalSamples, projectEvalSamples, type EvalSampleParams } from './eval-samples-mapper';
import { ingestEvalRow } from './eval-ingest';
import { bulkIngestEvalSamples } from './eval-samples-ingest';
import type { SkipTracker } from './skip-tracker';
import { completeMeasurementSnapshot } from './measurement-snapshot';
import { refreshLatestBenchmarks } from './db-utils';

export interface ReceiptIngestInputs {
  benchmarkFiles: string[];
  benchmarkPointCounts: Map<string, number>;
  evaluations: { params: EvalParams; samples: EvalSampleParams[] }[];
}

/** Use accepted member bindings, never discovery names, to select required ingest inputs. */
export function prepareReceiptIngestInputs(
  receipt: MeasurementReceipt,
  root: string,
  tracker: SkipTracker,
): ReceiptIngestInputs {
  verifyMeasurementSnapshot(receipt, root);
  const member = (id: number, name: string) =>
    path.join(root, receipt.artifacts.find((artifact) => artifact.id === id)!.name, name);
  const benchmarkFiles = new Set<string>();
  const benchmarkPointCounts = new Map<string, number>();
  const evaluations: ReceiptIngestInputs['evaluations'] = [];
  for (const point of receipt.points) {
    if (point.kind === 'throughput') {
      const file = member(point.normalized_artifact_id, point.normalized_path);
      benchmarkFiles.add(file);
      benchmarkPointCounts.set(file, (benchmarkPointCounts.get(file) ?? 0) + 1);
      continue;
    }
    const mapped = [...mapReceiptPointRows(receipt, root, point).mapped].filter(
      (row): row is EvalParams =>
        row !== null && 'task' in row && row.task === point.task && row.conc === point.concurrency,
    );
    if (mapped.length !== 1) throw new Error('Required eval point is missing or ambiguous');
    const samples = projectEvalSamples(
      mapEvalSamples(
        fs.readFileSync(member(point.samples_artifact_id!, point.samples_path!), 'utf8'),
        tracker,
      ),
    );
    if (samples.length !== point.sample_count)
      throw new Error('Required eval sample projection is incomplete');
    evaluations.push({ params: mapped[0], samples });
  }
  return { benchmarkFiles: [...benchmarkFiles], benchmarkPointCounts, evaluations };
}

/** Changelog modes cannot narrow the independently accepted measurement scope. */
export function assertReceiptIngestMode(inputs: ReceiptIngestInputs, evalsOnly: boolean): void {
  if (evalsOnly && inputs.benchmarkFiles.length > 0)
    throw new Error('Accepted throughput points cannot be imported as an evals-only run');
}

/** Count successful persisted point identities per accepted file, including replay. */
export async function completeReceiptIngest(
  sql: postgres.Sql,
  receipt: MeasurementReceipt,
  inputs: ReceiptIngestInputs,
  persistedBenchmarks: ReadonlyMap<string, number>,
): Promise<void> {
  for (const [file, expected] of inputs.benchmarkPointCounts) {
    if ((persistedBenchmarks.get(file) ?? 0) !== expected)
      throw new Error(`Accepted throughput points were skipped or collapsed: ${file}`);
  }
  await refreshLatestBenchmarks(sql);
  await completeMeasurementSnapshot(sql, receipt);
}

/** Persist both supported eval shapes through the same summary-and-samples path. */
export async function ingestReceiptEvaluations(
  sql: postgres.Sql,
  inputs: ReceiptIngestInputs,
  getOrCreateConfig: (config: ConfigParams) => Promise<number>,
  workflowRunId: number,
  date: string,
): Promise<{ newEvals: number; newSamples: number; sampleFiles: number }> {
  let newEvals = 0;
  let newSamples = 0;
  for (const { params, samples } of inputs.evaluations) {
    const configId = await getOrCreateConfig(params.config);
    const result = await ingestEvalRow(sql, configId, params, workflowRunId, date);
    if (result.outcome === 'new') newEvals++;
    const stored = await bulkIngestEvalSamples(sql, result.id, samples);
    newSamples += stored.newCount;
  }
  return { newEvals, newSamples, sampleFiles: inputs.evaluations.length };
}
