import { DB_MODEL_TO_DISPLAY, GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import { buildAvailabilityHwKey } from '@/lib/chart-utils';
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
 * For each row, returns the immediately preceding run of the same config
 * (chronologically by date). Rows with no earlier run are absent from the map.
 * Used to build "compare runs" links between adjacent submissions of the same
 * benchmark config.
 */
export function computePreviousRuns(
  data: SubmissionSummaryRow[],
): Map<string, SubmissionSummaryRow> {
  const byConfig = new Map<string, SubmissionSummaryRow[]>();
  for (const row of data) {
    const k = submissionConfigKey(row);
    const list = byConfig.get(k);
    if (list) list.push(row);
    else byConfig.set(k, [row]);
  }
  const result = new Map<string, SubmissionSummaryRow>();
  for (const rows of byConfig.values()) {
    const sorted = [...rows].toSorted((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sorted.length; i++) {
      result.set(submissionRowKey(sorted[i]), sorted[i - 1]);
    }
  }
  return result;
}

/**
 * For each row, returns the image used by the immediately preceding run of
 * the same config IF that image differed (i.e. this row is a version bump).
 * Rows with no earlier run, or whose preceding run used the same image, are
 * absent from the map so the caller can fall back to a single-image label.
 */
export function computePreviousImages(data: SubmissionSummaryRow[]): Map<string, string> {
  const prevRuns = computePreviousRuns(data);
  const byKey = new Map(data.map((r) => [submissionRowKey(r), r]));
  const result = new Map<string, string>();
  for (const [key, prev] of prevRuns) {
    const cur = byKey.get(key);
    if (cur && prev.image && cur.image && prev.image !== cur.image) {
      result.set(key, prev.image);
    }
  }
  return result;
}

/** Check if hardware is non-NVIDIA. */
export function isNonNvidia(hardware: string): boolean {
  return getVendor(hardware) !== 'NVIDIA';
}

/**
 * Build an /inference URL that loads the pareto frontier for a single config
 * with two run dates overlaid for comparison. Returns null if we don't have
 * enough mapping info to construct a meaningful URL (e.g. unknown model prefix).
 *
 * The submission row carries no ISL/OSL, so we deliberately omit `i_seq` and
 * let the inference chart fall back to its default sequence — users can switch
 * sequence on the chart if the config was only run at a non-default one.
 */
export function buildInferenceCompareUrl(
  currentRow: SubmissionSummaryRow,
  previousRow: SubmissionSummaryRow,
): string | null {
  // DB_MODEL_TO_DISPLAY covers every DB prefix incl. point-release aliases
  // (gptoss120b, glm5.1, kimik2.6, kimik2.7-code, minimaxm2.7, llama70b).
  // MODEL_PREFIX_MAPPING only has the single canonical prefix per Model enum
  // and misses those rows.
  const displayModel = DB_MODEL_TO_DISPLAY[currentRow.model];
  if (!displayModel) return null;
  const hwKey = buildAvailabilityHwKey(
    currentRow.hardware,
    currentRow.framework,
    currentRow.spec_method,
    currentRow.disagg,
  );
  // Use i_dstart/i_dend (not i_dates) so the visible "Comparison Date Range"
  // picker is populated. buildComparisonDates() pushes both endpoints into the
  // comparison set, and the endpoint equal to g_rundate is deduped, leaving the
  // chart with exactly two frontier lines: the new run and the previous run.
  const params = new URLSearchParams({
    g_model: displayModel,
    g_rundate: currentRow.date,
    i_gpus: hwKey,
    i_dstart: previousRow.date,
    i_dend: currentRow.date,
    i_prec: currentRow.precision,
  });
  return `/inference?${params.toString()}`;
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
