import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import type { SubmissionSummaryRow, SubmissionVolumeRow } from '@/lib/submissions-types';

/** Get vendor name for a hardware key. */
export function getVendor(hardware: string): string {
  return GPU_VENDORS[hardware] ?? 'Unknown';
}

/** Unique key for a (config, date) row. */
export const submissionRowKey = (row: SubmissionSummaryRow): string =>
  `${row.model}_${row.hardware}_${row.framework}_${row.precision}_${row.spec_method}_${row.disagg}_${row.is_multinode}_${row.num_prefill_gpu}_${row.num_decode_gpu}_${row.prefill_tp}_${row.prefill_ep}_${row.decode_tp}_${row.decode_ep}_${row.date}`;

/** Stable key for a benchmark config across dates (everything except date/image). */
const submissionConfigKey = (row: SubmissionSummaryRow): string =>
  `${row.model}|${row.hardware}|${row.framework}|${row.precision}|${row.spec_method}|${row.disagg}|${row.is_multinode}|${row.num_prefill_gpu}|${row.num_decode_gpu}|${row.prefill_tp}|${row.prefill_ep}|${row.decode_tp}|${row.decode_ep}`;

/**
 * For each row, returns the image used by the immediately preceding run of
 * the same config IF that image differed (i.e. this row is a version bump).
 * Rows with no earlier run, or whose preceding run used the same image, are
 * absent from the map so the caller can fall back to a single-image label.
 */
export function computePreviousImages(data: SubmissionSummaryRow[]): Map<string, string> {
  const byConfig = new Map<string, SubmissionSummaryRow[]>();
  for (const row of data) {
    const k = submissionConfigKey(row);
    const list = byConfig.get(k);
    if (list) list.push(row);
    else byConfig.set(k, [row]);
  }
  const result = new Map<string, string>();
  for (const rows of byConfig.values()) {
    const sorted = [...rows].toSorted((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev.image && cur.image && prev.image !== cur.image) {
        result.set(submissionRowKey(cur), prev.image);
      }
    }
  }
  return result;
}

/** Check if hardware is non-NVIDIA. */
export function isNonNvidia(hardware: string): boolean {
  return getVendor(hardware) !== 'NVIDIA';
}

export interface WeeklyVolume {
  week: string; // ISO week start date (Monday)
  nvidia: number;
  nonNvidia: number;
  total: number;
}

/** Get the Monday of the ISO week for a given date string. */
function getIsoWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Aggregate daily volume rows into weekly totals by vendor. */
export function groupVolumeByWeek(volume: SubmissionVolumeRow[]): WeeklyVolume[] {
  const weekMap = new Map<string, { nvidia: number; nonNvidia: number }>();

  for (const row of volume) {
    const week = getIsoWeekStart(row.date);
    const entry = weekMap.get(week) ?? { nvidia: 0, nonNvidia: 0 };
    if (isNonNvidia(row.hardware)) {
      entry.nonNvidia += row.datapoints;
    } else {
      entry.nvidia += row.datapoints;
    }
    weekMap.set(week, entry);
  }

  return [...weekMap.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([week, counts]) => ({
      week,
      nvidia: counts.nvidia,
      nonNvidia: counts.nonNvidia,
      total: counts.nvidia + counts.nonNvidia,
    }));
}

export interface CumulativePoint {
  date: string;
  nvidia: number;
  nonNvidia: number;
  total: number;
}

/** Compute cumulative datapoint totals over time. */
export function computeCumulative(volume: SubmissionVolumeRow[]): CumulativePoint[] {
  // First aggregate by date
  const dateMap = new Map<string, { nvidia: number; nonNvidia: number }>();
  for (const row of volume) {
    const entry = dateMap.get(row.date) ?? { nvidia: 0, nonNvidia: 0 };
    if (isNonNvidia(row.hardware)) {
      entry.nonNvidia += row.datapoints;
    } else {
      entry.nvidia += row.datapoints;
    }
    dateMap.set(row.date, entry);
  }

  const sorted = [...dateMap.entries()].toSorted(([a], [b]) => a.localeCompare(b));

  let cumNvidia = 0;
  let cumNonNvidia = 0;
  return sorted.map(([date, counts]) => {
    cumNvidia += counts.nvidia;
    cumNonNvidia += counts.nonNvidia;
    return {
      date,
      nvidia: cumNvidia,
      nonNvidia: cumNonNvidia,
      total: cumNvidia + cumNonNvidia,
    };
  });
}

/** Compute total stats from summary rows. */
export function computeTotalStats(summary: SubmissionSummaryRow[]) {
  let totalDatapoints = 0;
  const configs = new Set<string>();
  const models = new Set<string>();
  const gpus = new Set<string>();

  for (const row of summary) {
    totalDatapoints += row.total_datapoints;
    configs.add(
      `${row.model}_${row.hardware}_${row.framework}_${row.precision}_${row.spec_method}_${row.disagg}_${row.num_prefill_gpu}_${row.num_decode_gpu}`,
    );
    models.add(row.model);
    gpus.add(row.hardware);
  }

  return {
    totalDatapoints,
    totalConfigs: configs.size,
    uniqueModels: models.size,
    uniqueGpus: gpus.size,
  };
}
