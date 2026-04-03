import { GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import type { SubmissionSummaryRow, SubmissionVolumeRow } from '@/lib/submissions-types';

/** Get vendor name for a hardware key. */
export function getVendor(hardware: string): string {
  return GPU_VENDORS[hardware] ?? 'Unknown';
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
  const d = new Date(dateStr + 'T00:00:00Z');
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
    .sort(([a], [b]) => a.localeCompare(b))
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

  const sorted = [...dateMap.entries()].sort(([a], [b]) => a.localeCompare(b));

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
  const models = new Set<string>();
  const gpus = new Set<string>();

  for (const row of summary) {
    totalDatapoints += row.total_datapoints;
    models.add(row.model);
    gpus.add(row.hardware);
  }

  return {
    totalDatapoints,
    totalConfigs: summary.length,
    uniqueModels: models.size,
    uniqueGpus: gpus.size,
  };
}
