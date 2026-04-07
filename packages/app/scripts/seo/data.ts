import { DB_MODEL_TO_DISPLAY, GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import type { BenchmarkRow } from '../../src/lib/api';
import type {
  BestConfig,
  ChangelogEntry,
  HistoryPoint,
  Improvement,
  ModelData,
  ParetoPoint,
} from './types';

/** Human-readable GPU name (e.g. "NVIDIA B200"). */
export function gpuDisplayName(hw: string): string {
  const vendor = GPU_VENDORS[hw];
  const upper = hw.toUpperCase();
  return vendor ? `${vendor} ${upper}` : upper;
}

/** Human-friendly model slug for article filenames. */
export function modelSlug(displayName: string): string {
  return displayName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

const fmtSeqPart = (n: number) => (n >= 1024 ? `${Math.round(n / 1024)}k` : String(n));

/** Sequence key from ISL/OSL. */
function seqKey(isl: number, osl: number): string {
  return `${fmtSeqPart(isl)}/${fmtSeqPart(osl)}`;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function isRetryable(error: unknown): boolean {
  // Network errors (fetch throws) are always retryable
  if (error instanceof TypeError) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
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
          medianIntvty: row.metrics.median_intvty ?? 0,
          conc: row.conc,
          tp: row.disagg ? row.num_prefill_gpu + row.num_decode_gpu : row.decode_tp,
          date: row.date,
        });
      }
    }

    const configs = [...configMap.values()].toSorted((a, b) => b.tputPerGpu - a.tputPerGpu);
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

/**
 * Cost per million tokens: costPerHour / (tps * 3600 / 1_000_000).
 * Same formula as useThroughputData.ts:16-18.
 */
export function costPerMtok(costPerHour: number, tputPerGpu: number): number {
  if (costPerHour <= 0 || tputPerGpu <= 0) return 0;
  return costPerHour / ((tputPerGpu * 3600) / 1_000_000);
}

/** Fetch historical benchmark data for a model+sequence from the API. */
export async function fetchHistory(
  baseUrl: string,
  displayName: string,
  isl: number,
  osl: number,
): Promise<BenchmarkRow[]> {
  const params = new URLSearchParams({
    model: displayName,
    isl: String(isl),
    osl: String(osl),
  });
  const url = `${baseUrl}/api/v1/benchmarks/history?${params}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status >= 400 && res.status < 500) {
        console.warn(`  History fetch ${displayName} ${isl}/${osl}: ${res.status}`);
        return [];
      }
      if (!res.ok) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        return [];
      }
      return (await res.json()) as BenchmarkRow[];
    } catch (error: unknown) {
      if (isRetryable(error) && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return [];
    }
  }
  return [];
}

/**
 * Group history rows by GPU config, pick best throughput per date per config.
 * Returns a map keyed by "hardware|framework|precision|disagg" with sorted history points.
 */
export function aggregateHistory(rows: BenchmarkRow[]): Record<string, HistoryPoint[]> {
  const byConfig = new Map<string, Map<string, HistoryPoint>>();

  for (const row of rows) {
    const tput = row.metrics.tput_per_gpu ?? 0;
    if (tput <= 0) continue;

    const configKey = `${row.hardware}|${row.framework}|${row.precision}|${row.disagg}`;
    let dateMap = byConfig.get(configKey);
    if (!dateMap) {
      dateMap = new Map();
      byConfig.set(configKey, dateMap);
    }

    const existing = dateMap.get(row.date);
    if (!existing || tput > existing.tputPerGpu) {
      dateMap.set(row.date, {
        date: row.date,
        hardware: row.hardware,
        framework: row.framework,
        precision: row.precision,
        disagg: row.disagg,
        tputPerGpu: tput,
        medianTtft: row.metrics.median_ttft ?? 0,
        medianTpot: row.metrics.median_tpot ?? 0,
        medianIntvty: row.metrics.median_intvty ?? 0,
        conc: row.conc,
      });
    }
  }

  const result: Record<string, HistoryPoint[]> = {};
  for (const [key, dateMap] of byConfig) {
    result[key] = [...dateMap.values()].toSorted(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }
  return result;
}

/** Fetch changelog entries for a specific date from the workflow-info API. */
export async function fetchChangelogs(baseUrl: string, date: string): Promise<ChangelogEntry[]> {
  const url = `${baseUrl}/api/v1/workflow-info?date=${encodeURIComponent(date)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      changelogs: {
        date: string;
        description: string;
        pr_link: string | null;
        config_keys: string[];
      }[];
    };
    return (data.changelogs ?? []).map((c) => ({
      date: c.date,
      description: c.description,
      prLink: c.pr_link,
      configKeys: c.config_keys,
    }));
  } catch {
    return [];
  }
}

/** Minimum throughput gain (as fraction) to flag as a notable improvement. */
const IMPROVEMENT_THRESHOLD = 0.2;

/**
 * Detect significant improvements: compare the latest two data points per config.
 * Flags any config where throughput increased by >20%.
 */
export function detectImprovements(
  history: Record<string, HistoryPoint[]>,
  model: string,
): Improvement[] {
  const improvements: Improvement[] = [];

  for (const points of Object.values(history)) {
    if (points.length < 2) continue;
    const prev = points.at(-2)!;
    const latest = points.at(-1)!;
    if (prev.tputPerGpu <= 0) continue;

    const pctGain = (latest.tputPerGpu - prev.tputPerGpu) / prev.tputPerGpu;
    if (pctGain >= IMPROVEMENT_THRESHOLD) {
      improvements.push({
        model,
        hardware: latest.hardware,
        framework: latest.framework,
        precision: latest.precision,
        disagg: latest.disagg,
        oldTput: prev.tputPerGpu,
        newTput: latest.tputPerGpu,
        pctGain,
        oldDate: prev.date,
        newDate: latest.date,
        changelogs: [], // populated later from workflow-info API
        relatedHistory: {}, // populated later with competing configs
      });
    }
  }

  return improvements.toSorted((a, b) => b.pctGain - a.pctGain);
}

/**
 * Compute pareto frontiers (throughput vs interactivity) per GPU from benchmark rows.
 * Groups all concurrency points by GPU (best framework/precision per GPU), then computes
 * the upper-right pareto frontier (higher throughput AND higher interactivity is better).
 *
 * Returns a map of gpuKey → ParetoPoint[] sorted by interactivity ascending.
 */
export function computeParetoFrontiers(
  rows: BenchmarkRow[],
  sequence: { isl: number; osl: number },
): Record<string, ParetoPoint[]> {
  // Collect all points per GPU (across all concurrencies, frameworks, precisions)
  const pointsByGpu = new Map<string, { x: number; y: number; conc: number }[]>();

  for (const row of rows) {
    if (row.isl !== sequence.isl || row.osl !== sequence.osl) continue;
    const tput = row.metrics.tput_per_gpu ?? 0;
    const intvty = row.metrics.median_intvty ?? 0;
    if (tput <= 0 || intvty <= 0) continue;

    const gpu = row.hardware;
    let pts = pointsByGpu.get(gpu);
    if (!pts) {
      pts = [];
      pointsByGpu.set(gpu, pts);
    }
    pts.push({ x: intvty, y: tput, conc: row.conc });
  }

  // Compute upper-right pareto frontier per GPU
  const result: Record<string, ParetoPoint[]> = {};

  for (const [gpu, points] of pointsByGpu) {
    // Sort by interactivity (x) ascending, then throughput (y) descending
    points.sort((a, b) => (a.x === b.x ? b.y - a.y : a.x - b.x));

    const front: typeof points = [];
    let maxY = -Infinity;

    for (const pt of points) {
      if (pt.y > maxY) {
        front.push(pt);
        maxY = pt.y;
      }
    }

    if (front.length >= 2) {
      result[gpu] = front.map((p) => ({
        interactivity: p.x,
        throughput: p.y,
        conc: p.conc,
      }));
    }
  }

  return result;
}
