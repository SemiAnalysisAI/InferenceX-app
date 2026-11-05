import { DB_MODEL_TO_DISPLAY, GPU_VENDORS } from '@semianalysisai/inferencex-constants';

import { buildAvailabilityHwKey } from '@/lib/charts/chart-utils';
import type {
  SubmissionSummaryRow,
  SubmissionVolumeRow,
} from '@/lib/submissions/submissions-types';

export function getVendor(hardware: string): string {
  return GPU_VENDORS[hardware] ?? 'Unknown';
}

export const submissionRowKey = (row: SubmissionSummaryRow): string =>
  `${row.model}_${row.hardware}_${row.framework}_${row.precision}_${row.spec_method}_${row.disagg}_${row.is_multinode}_${row.num_prefill_gpu}_${row.num_decode_gpu}_${row.prefill_tp}_${row.prefill_ep}_${row.decode_tp}_${row.decode_ep}_${row.date}`;

const submissionConfigKey = (row: SubmissionSummaryRow): string =>
  `${row.model}|${row.hardware}|${row.framework}|${row.precision}|${row.spec_method}|${row.disagg}|${row.is_multinode}|${row.num_prefill_gpu}|${row.num_decode_gpu}|${row.prefill_tp}|${row.prefill_ep}|${row.decode_tp}|${row.decode_ep}`;

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

export function isNonNvidia(hardware: string): boolean {
  return getVendor(hardware) !== 'NVIDIA';
}

export function buildInferenceCompareUrl(
  currentRow: SubmissionSummaryRow,
  previousRow: SubmissionSummaryRow,
): string | null {
  const displayModel = DB_MODEL_TO_DISPLAY[currentRow.model];
  if (!displayModel) return null;
  const hwKey = buildAvailabilityHwKey(
    currentRow.hardware,
    currentRow.framework,
    currentRow.spec_method,
    currentRow.disagg,
  );
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
  week: string;
  nvidia: number;
  nonNvidia: number;
  total: number;
}

function getIsoWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export const ON_CHANGE_ONLY_START_DATE = '2025-12-16';

export function selectVolumeRows(
  volume: SubmissionVolumeRow[],
  mode: 'weekly' | 'cumulative',
  onChangeOnly: boolean,
): SubmissionVolumeRow[] {
  return mode === 'weekly' && onChangeOnly
    ? volume.filter((row) => row.date >= ON_CHANGE_ONLY_START_DATE)
    : volume;
}

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

export function computeCumulative(volume: SubmissionVolumeRow[]): CumulativePoint[] {
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
