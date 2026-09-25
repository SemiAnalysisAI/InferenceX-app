/**
 * Server-side OperatorX reads: the active source plus normalization and in-process
 * caching. API routes call only this module.
 */
import type { OperatorXRunRef } from '@semianalysisai/inferencex-db/operatorx/bundle';
import {
  buildComparison,
  type Comparison,
  type ComparisonInput,
  type ComparisonOp,
} from '@semianalysisai/inferencex-db/operatorx/compare';
import {
  normalizeBundle,
  type OperatorXDataset,
  type OperatorXResultDetail,
} from '@semianalysisai/inferencex-db/operatorx/normalize';

import { OperatorXSourceError } from './source';
import { getOperatorXSource } from './sources';

const LIST_TTL_MS = 60_000;
const DATASET_TTL_MS = 10 * 60_000;
const MAX_DATASETS = 32;
const COMPARISON_TTL_MS = 5 * 60_000;

type Normalized = ReturnType<typeof normalizeBundle>;

let runsCache: { at: number; value: Promise<OperatorXRunRef[]> } | null = null;
const datasets = new Map<string, { at: number; value: Promise<Normalized> }>();

export function sourceName(): string {
  return getOperatorXSource().name;
}

export function listRuns(): Promise<OperatorXRunRef[]> {
  if (!runsCache || Date.now() - runsCache.at > LIST_TTL_MS) {
    const value = getOperatorXSource().listRuns();
    runsCache = { at: Date.now(), value };
    value.catch(() => {
      if (runsCache?.value === value) runsCache = null;
    });
  }
  return runsCache.value;
}

function normalized(runId: string): Promise<Normalized> {
  const hit = datasets.get(runId);
  if (hit && Date.now() - hit.at < DATASET_TTL_MS) {
    datasets.delete(runId); // refresh LRU position
    datasets.set(runId, hit);
    return hit.value;
  }
  const value = getOperatorXSource().getBundle(runId).then(normalizeBundle);
  datasets.set(runId, { at: Date.now(), value });
  value.catch(() => datasets.delete(runId));
  while (datasets.size > MAX_DATASETS) datasets.delete(datasets.keys().next().value!);
  return value;
}

export async function getDataset(runId: string): Promise<OperatorXDataset> {
  const { run, results } = await normalized(runId);
  return { run, results };
}

export async function getResultDetail(
  runId: string,
  index: number,
): Promise<OperatorXResultDetail> {
  const { results, metrics } = await normalized(runId);
  const result = results[index];
  if (!result) throw new OperatorXSourceError('Result not found', 404);
  return { result, metrics: metrics[index] ?? {} };
}

const OP_TESTLIST_PREFIX: Record<ComparisonOp, string> = { gemm: 'gemm', moe: 'moe' };
const comparisons = new Map<ComparisonOp, { at: number; value: Promise<Comparison> }>();

/**
 * The newest timing run of each (runner, testlist) holding the op, combined into one
 * cross-hardware comparison. Runs that fail to load are skipped.
 */
async function compareOp(op: ComparisonOp): Promise<Comparison> {
  const prefix = OP_TESTLIST_PREFIX[op];
  const covered = new Set<string>();
  const picked: OperatorXRunRef[] = [];
  for (const run of await listRuns()) {
    const plan = run.plan;
    if (!plan || run.unavailable || plan.mode !== 'timing') continue;
    const fresh = plan.testlists.filter(
      (t) => t.startsWith(prefix) && !covered.has(`${plan.runner}|${t}`),
    );
    if (fresh.length === 0) continue;
    for (const t of fresh) covered.add(`${plan.runner}|${t}`);
    picked.push(run);
  }
  const loaded = await Promise.allSettled(picked.map((run) => normalized(run.run_id)));
  const inputs: ComparisonInput[] = [];
  loaded.forEach((result, i) => {
    if (result.status === 'fulfilled')
      inputs.push({ runner: picked[i].plan!.runner, dataset: result.value });
  });
  return buildComparison(op, inputs);
}

export function getComparison(op: ComparisonOp): Promise<Comparison> {
  const hit = comparisons.get(op);
  if (hit && Date.now() - hit.at < COMPARISON_TTL_MS) return hit.value;
  const value = compareOp(op);
  comparisons.set(op, { at: Date.now(), value });
  value.catch(() => comparisons.delete(op));
  return value;
}

export function errorStatus(error: unknown): number {
  return error instanceof OperatorXSourceError ? error.status : 503;
}
