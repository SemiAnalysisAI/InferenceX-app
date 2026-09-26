/**
 * Server-side OperatorX reads: the active source plus normalization and in-process
 * caching. API routes call only this module.
 */
import type { OperatorXRunRef } from '@semianalysisai/inferencex-db/operatorx/bundle';
import {
  buildComparison,
  comparisonCaseKey,
  type Comparison,
  type ComparisonInput,
  type ComparisonOp,
} from '@semianalysisai/inferencex-db/operatorx/compare';
import {
  normalizeBundle,
  type OperatorXDataset,
  type OperatorXResultDetail,
} from '@semianalysisai/inferencex-db/operatorx/normalize';
import {
  compactTimeline,
  type OperatorXTimeline,
} from '@semianalysisai/inferencex-db/operatorx/timeline';

import { OperatorXSourceError } from './source';
import { getOperatorXSource } from './sources';

const LIST_TTL_MS = 60_000;
const DATASET_TTL_MS = 10 * 60_000;
const MAX_DATASETS = 32;
const COMPARISON_TTL_MS = 5 * 60_000;
const COMPARISON_READ_BATCH = 4;

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

const compared = new Map<ComparisonOp, { at: number; value: Promise<Comparison> }>();

/**
 * Keep the newest actual result for each hardware/case/backend. A missing row only
 * stands until an older run supplies a result; errors and unsupported results are
 * real outcomes and remain newest-wins. Read a few bundles at a time and retain only
 * selected rows, not every historical profile.
 */
async function compareOp(op: ComparisonOp): Promise<Comparison> {
  const prefix = OP_TESTLIST_PREFIX[op];
  const listed = await listRuns();
  const runs = listed.filter((run) => {
    const plan = run.plan;
    return plan?.mode === 'timing' && plan.testlists.some((t) => t.startsWith(prefix));
  });
  const selected = new Map<
    string,
    { runner: string; run: Normalized['run']; result: Normalized['results'][number] }
  >();
  let failedReads = 0;
  const source = getOperatorXSource();
  for (let i = 0; i < runs.length; i += COMPARISON_READ_BATCH) {
    const batch = runs.slice(i, i + COMPARISON_READ_BATCH);
    const loaded = await Promise.allSettled(
      batch.map((run) => source.getBundle(run.run_id).then(normalizeBundle)),
    );
    for (const [j, outcome] of loaded.entries()) {
      if (outcome.status === 'rejected') {
        failedReads++;
        continue;
      }
      const { run: summary, results } = outcome.value;
      const runner = batch[j].plan!.runner;
      for (const result of results) {
        const key = comparisonCaseKey(op, runner, result);
        if (key === null) continue;
        const previous = selected.get(key);
        if (!previous || (previous.result.status === 'missing' && result.status !== 'missing')) {
          selected.set(key, { runner, run: summary, result });
        }
      }
    }
  }
  if (selected.size === 0 && failedReads > 0)
    throw new OperatorXSourceError('OperatorX run documents could not be read', 503);

  const byRun = new Map<string, ComparisonInput>();
  for (const { runner, run, result } of selected.values()) {
    let input = byRun.get(run.runId);
    if (!input) {
      input = { runner, dataset: { run, results: [] } };
      byRun.set(run.runId, input);
    }
    input.dataset.results.push(result);
  }
  return buildComparison(op, [...byRun.values()]);
}

function getCompared(op: ComparisonOp): Promise<Comparison> {
  const hit = compared.get(op);
  if (hit && Date.now() - hit.at < COMPARISON_TTL_MS) return hit.value;
  const value = compareOp(op);
  compared.set(op, { at: Date.now(), value });
  value.catch(() => compared.delete(op));
  return value;
}

export function getComparison(op: ComparisonOp): Promise<Comparison> {
  return getCompared(op);
}

/**
 * Read timelines from their original stored runs. A newer comparison can replace a
 * row without removing the older result that a client's open detail still names.
 * Read current bundles rather than the run-ID cache: a re-ingest replaces the stored
 * revision while keeping the run ID and result indices.
 */
export async function getTimelines(
  op: ComparisonOp,
  refs: string[],
): Promise<{ timelines: Record<string, OperatorXTimeline | null>; known: boolean }> {
  const timelines: Record<string, OperatorXTimeline | null> = {};
  let known = true;
  const loaded = new Map<string, Promise<Normalized>>();
  for (const ref of refs) {
    const [runId, rawIndex, revision] = ref.split(':');
    const index = Number(rawIndex);
    try {
      let bundle = loaded.get(runId);
      if (!bundle) {
        bundle = getOperatorXSource().getBundle(runId).then(normalizeBundle);
        loaded.set(runId, bundle);
      }
      const { run, results, metrics } = await bundle;
      const result = results[index];
      if (!revision || revision !== run.revision || !result || result.opType !== op) {
        timelines[ref] = null;
        known = false;
      } else {
        timelines[ref] = compactTimeline(metrics[index]);
      }
    } catch (error) {
      if (!(error instanceof OperatorXSourceError) || error.status !== 404) throw error;
      timelines[ref] = null;
      known = false;
    }
  }
  return { timelines, known };
}

export function errorStatus(error: unknown): number {
  return error instanceof OperatorXSourceError ? error.status : 503;
}

/** Our own source errors say what failed; anything else stays generic. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof OperatorXSourceError ? `${fallback}: ${error.message}` : fallback;
}
