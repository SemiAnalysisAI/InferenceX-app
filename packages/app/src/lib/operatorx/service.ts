import {
  buildRunComparison,
  mergeRunComparisons,
  OPERATORX_COMPARISON_VERSION,
} from '@semianalysisai/inferencex-db/operatorx/comparison-cache';
import type { OperatorXRunRef } from '@semianalysisai/inferencex-db/operatorx/bundle';
import {
  type Comparison,
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

import { cachedQuery, operatorXBlobPrefix } from '@/lib/cache/api-cache';

import { OperatorXSourceError } from './source';
import { getOperatorXSource } from './sources';

const MAX_DATASETS = 32;
const COMPARISON_READ_BATCH = 4;
const TIMELINE_READ_BATCH = 4;

type Normalized = ReturnType<typeof normalizeBundle>;

let runsInFlight: Promise<OperatorXRunRef[]> | null = null;
const datasets = new Map<string, Promise<Normalized>>();

export function sourceName(): string {
  return getOperatorXSource().name;
}

export function listRuns(): Promise<OperatorXRunRef[]> {
  if (!runsInFlight) {
    runsInFlight = getOperatorXSource().listRuns();
    const clear = () => {
      runsInFlight = null;
    };
    runsInFlight.then(clear, clear);
  }
  return runsInFlight;
}

const revisionOf = (run: OperatorXRunRef) => run.revision ?? String(run.run_attempt);

async function normalized(runId: string): Promise<Normalized> {
  const runs = await listRuns();
  const run = runs.find((r) => r.run_id === runId);
  if (!run) throw new OperatorXSourceError('Run not found', 404);
  return normalizedRun(run);
}

function normalizedRun(run: OperatorXRunRef): Promise<Normalized> {
  const runId = run.run_id;
  const key = `${runId}:${revisionOf(run)}`;
  const hit = datasets.get(key);
  if (hit) {
    datasets.delete(key);
    datasets.set(key, hit);
    return hit;
  }
  const value = getOperatorXSource().getBundle(runId).then(normalizeBundle);
  datasets.set(key, value);
  value.catch(() => datasets.delete(key));
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

const compared = new Map<ComparisonOp, { revisions: string; value: Promise<Comparison> }>();
const partial = new WeakSet<Comparison>();

export function isPartialComparison(comparison: Comparison): boolean {
  return partial.has(comparison);
}

function comparisonRuns(op: ComparisonOp, listed: OperatorXRunRef[]): OperatorXRunRef[] {
  const prefix = OP_TESTLIST_PREFIX[op];
  return listed.filter((run) => {
    const plan = run.plan;
    return plan?.mode === 'timing' && plan.testlists.some((t) => t.startsWith(prefix));
  });
}

async function compareOp(op: ComparisonOp, runs: OperatorXRunRef[]): Promise<Comparison> {
  const comparisons: Comparison[] = [];
  let failedReads = 0;
  const source = getOperatorXSource();
  const compactRuns = source.getRunComparisons ? await source.getRunComparisons(runs, op) : null;
  for (let i = 0; i < runs.length; i += COMPARISON_READ_BATCH) {
    const batch = runs.slice(i, i + COMPARISON_READ_BATCH);
    const loaded = await Promise.allSettled(
      batch.map(async (run) => {
        const compact = compactRuns
          ? compactRuns.get(run.run_id)
          : await source.getRunComparison?.(run.run_id, op);
        if (compact) return compact;
        // Legacy/local sources retain the same normalizer and source indices.
        // Reuse revision-keyed normalization rather than loading raw artifacts twice.
        const dataset = await normalizedRun(run);
        return buildRunComparison(op, { runner: run.plan!.runner, dataset });
      }),
    );
    for (const outcome of loaded) {
      if (outcome.status === 'rejected') failedReads++;
      else comparisons.push(outcome.value);
    }
  }
  const comparison = mergeRunComparisons(op, comparisons);
  if (comparison.rows.length === 0 && failedReads > 0)
    throw new OperatorXSourceError('OperatorX run documents could not be read', 503);
  if (failedReads > 0) partial.add(comparison);
  return comparison;
}

// Throw before cache persistence; carry the partial response back to the caller.
class UncacheableComparisonError extends Error {
  readonly comparison: Comparison;

  constructor(comparison: Comparison) {
    super('OperatorX comparison is incomplete or its revision changed during the read');
    this.name = 'UncacheableComparisonError';
    this.comparison = comparison;
  }
}

async function sharedComparison(
  op: ComparisonOp,
  runs: OperatorXRunRef[],
  revisions: string,
): Promise<Comparison> {
  if (getOperatorXSource().name !== 'database') return compareOp(op, runs);
  const read = cachedQuery(
    async (_revisions: string) => {
      const comparison = await compareOp(op, runs);
      const expected = new Map(runs.map((run) => [run.run_id, revisionOf(run)]));
      if (
        partial.has(comparison) ||
        comparison.rows.some((row) => expected.get(row.runId) !== row.revision)
      ) {
        partial.add(comparison);
        throw new UncacheableComparisonError(comparison);
      }
      return comparison;
    },
    `${operatorXBlobPrefix()}comparison:v${OPERATORX_COMPARISON_VERSION}:${op}`,
    { blobOnly: true },
  );
  try {
    return await read(revisions);
  } catch (error) {
    if (error instanceof UncacheableComparisonError) return error.comparison;
    throw error;
  }
}

export async function getComparison(op: ComparisonOp): Promise<Comparison> {
  const runs = comparisonRuns(op, await listRuns());
  const revisions = runs.map((run) => `${run.run_id}:${revisionOf(run)}`).join(',');
  const hit = compared.get(op);
  if (hit?.revisions === revisions) return hit.value;
  const value = sharedComparison(op, runs, revisions);
  compared.set(op, { revisions, value });
  const drop = () => {
    if (compared.get(op)?.value === value) compared.delete(op);
  };
  value.then((comparison) => partial.has(comparison) && drop(), drop);
  return value;
}

export async function getTimelines(
  op: ComparisonOp,
  refs: string[],
): Promise<{ timelines: Record<string, OperatorXTimeline | null>; known: boolean }> {
  const timelines: Record<string, OperatorXTimeline | null> = Object.fromEntries(
    refs.map((ref) => [ref, null]),
  );
  let known = true;
  const runs = [...Map.groupBy(refs, (ref) => ref.split(':')[0])];
  const source = getOperatorXSource();
  const readRun = async ([runId, runRefs]: [string, string[]]) => {
    try {
      const { run, results, metrics } = normalizeBundle(await source.getBundle(runId));
      for (const ref of runRefs) {
        const [, rawIndex, revision] = ref.split(':');
        const index = Number(rawIndex);
        const result = results[index];
        if (!revision || revision !== run.revision || !result || result.opType !== op) {
          known = false;
        } else {
          timelines[ref] = compactTimeline(metrics[index]);
        }
      }
    } catch (error) {
      if (!(error instanceof OperatorXSourceError) || error.status !== 404) throw error;
      known = false;
    }
  };
  for (let i = 0; i < runs.length; i += TIMELINE_READ_BATCH) {
    await Promise.all(runs.slice(i, i + TIMELINE_READ_BATCH).map(readRun));
  }
  return { timelines, known };
}

export function errorStatus(error: unknown): number {
  return error instanceof OperatorXSourceError ? error.status : 503;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof OperatorXSourceError ? `${fallback}: ${error.message}` : fallback;
}
