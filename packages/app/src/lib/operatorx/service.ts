/**
 * Server-side OperatorX reads: the active source plus normalization and in-process
 * caching. API routes call only this module.
 */
import type { OperatorXRunRef } from '@semianalysisai/inferencex-db/operatorx/bundle';
import {
  normalizeBundle,
  type OperatorXDataset,
  type OperatorXResultDetail,
} from '@semianalysisai/inferencex-db/operatorx/normalize';

import { OperatorXSourceError } from './source';
import { getOperatorXSource } from './sources';

const LIST_TTL_MS = 60_000;
const DATASET_TTL_MS = 10 * 60_000;
const MAX_DATASETS = 8;

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

export function errorStatus(error: unknown): number {
  return error instanceof OperatorXSourceError ? error.status : 503;
}
