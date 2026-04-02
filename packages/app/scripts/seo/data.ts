import { DB_MODEL_TO_DISPLAY, GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import type { BenchmarkRow } from '../../src/lib/api';
import type { BestConfig, ModelData } from './types';

/** Human-readable GPU name (e.g. "NVIDIA B200"). */
export function gpuDisplayName(hw: string): string {
  const vendor = GPU_VENDORS[hw];
  const upper = hw.toUpperCase().replace('MI', 'MI ');
  return vendor ? `${vendor} ${upper}` : upper;
}

/** Human-friendly model slug for article filenames. */
export function modelSlug(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Sequence key from ISL/OSL. */
function seqKey(isl: number, osl: number): string {
  const fmt = (n: number) => (n >= 1024 ? `${Math.round(n / 1024)}k` : String(n));
  return `${fmt(isl)}/${fmt(osl)}`;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function isRetryable(error: unknown): boolean {
  // Network errors (fetch throws) are always retryable
  if (error instanceof TypeError) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch benchmark data for a model from the API (retries on network errors / 5xx). */
export async function fetchBenchmarks(
  baseUrl: string,
  displayName: string,
): Promise<BenchmarkRow[]> {
  const url = `${baseUrl}/api/v1/benchmarks?model=${encodeURIComponent(displayName)}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);

      // 4xx — not retryable, return immediately
      if (res.status >= 400 && res.status < 500) {
        console.warn(`  Failed to fetch ${displayName}: ${res.status} ${res.statusText}`);
        return [];
      }

      // 5xx — retryable
      if (!res.ok) {
        const msg = `${res.status} ${res.statusText}`;
        if (attempt < MAX_RETRIES) {
          console.warn(
            `  Fetch ${displayName} failed (${msg}), retrying (${attempt}/${MAX_RETRIES})...`,
          );
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        console.warn(`  Failed to fetch ${displayName} after ${MAX_RETRIES} attempts: ${msg}`);
        return [];
      }

      return (await res.json()) as BenchmarkRow[];
    } catch (error: unknown) {
      if (isRetryable(error) && attempt < MAX_RETRIES) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
          `  Fetch ${displayName} error (${reason}), retrying (${attempt}/${MAX_RETRIES})...`,
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`  Failed to fetch ${displayName} after ${MAX_RETRIES} attempts: ${reason}`);
      return [];
    }
  }

  return [];
}

/**
 * Group benchmark rows by sequence length and find the best config
 * (highest tput_per_gpu) for each GPU+precision+framework combo.
 */
export function aggregateModelData(
  modelKey: string,
  displayName: string,
  rows: BenchmarkRow[],
): ModelData {
  const bySeq = new Map<string, BenchmarkRow[]>();

  for (const row of rows) {
    const key = seqKey(row.isl, row.osl);
    if (key === '1k/8k') continue; // deprecated sequence, skip
    const arr = bySeq.get(key);
    if (arr) {
      arr.push(row);
    } else {
      bySeq.set(key, [row]);
    }
  }

  const bestBySequence = new Map<string, BestConfig[]>();

  for (const [seq, seqRows] of bySeq) {
    // Group by hardware+precision+framework+disagg, keep best tput_per_gpu
    const configMap = new Map<string, BestConfig>();

    for (const row of seqRows) {
      const tput = row.metrics.tput_per_gpu ?? 0;
      if (tput <= 0) continue;

      const configKey = `${row.hardware}|${row.precision}|${row.framework}|${row.disagg}`;
      const existing = configMap.get(configKey);

      if (!existing || tput > existing.tputPerGpu) {
        configMap.set(configKey, {
          hardware: row.hardware,
          precision: row.precision,
          framework: row.framework,
          disagg: row.disagg,
          tputPerGpu: tput,
          medianTtft: row.metrics.median_ttft ?? 0,
          medianTpot: row.metrics.median_tpot ?? 0,
          medianE2el: row.metrics.median_e2el ?? 0,
          conc: row.conc,
          tp: row.disagg ? row.num_prefill_gpu + row.num_decode_gpu : row.decode_tp,
          date: row.date,
        });
      }
    }

    const configs = [...configMap.values()].sort((a, b) => b.tputPerGpu - a.tputPerGpu);
    bestBySequence.set(seq, configs);
  }

  return { modelKey, displayName, rows, bestBySequence };
}

/** Get the distinct GPU keys that have data for a model at the primary sequence. */
export function distinctGpus(data: ModelData, primarySeq: string): Set<string> {
  const configs = data.bestBySequence.get(primarySeq) ?? [];
  return new Set(configs.map((c) => c.hardware));
}

/** All available model entries as [dbKey, displayName] pairs. */
export function allModels(): [string, string][] {
  return Object.entries(DB_MODEL_TO_DISPLAY);
}
