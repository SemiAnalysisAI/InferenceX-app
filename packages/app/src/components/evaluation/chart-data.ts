import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import type { EvalChangelogEntry, EvaluationChartData } from '@/components/evaluation/types';
import type { EvalRow } from '@/lib/api';
import { normalizeEvalHardwareKey } from '@/lib/chart-utils';
import { getModelSortIndex, HARDWARE_CONFIG } from '@/lib/constants';
import { getFrameworkLabel } from '@/lib/utils';

function buildConfigLabel(
  hwLabel: string,
  framework: string,
  specMethod: string,
  precision: string,
  conc: number | null,
  tp: number | undefined,
  showPrecision: boolean,
): string {
  const headerSuffixes: string[] = [];
  if (framework && framework !== '1k8k') headerSuffixes.push(getFrameworkLabel(framework));
  if (specMethod && specMethod !== 'none') headerSuffixes.push(getFrameworkLabel(specMethod));

  const detailSuffixes: string[] = [];
  if (precision && showPrecision) detailSuffixes.push(precision.toUpperCase());
  if (conc) detailSuffixes.push(`C${conc}`);
  if (tp !== undefined) detailSuffixes.push(`TP${tp}`);

  const line1 = headerSuffixes.length > 0 ? `${hwLabel} (${headerSuffixes.join(', ')})` : hwLabel;
  return detailSuffixes.length > 0 ? `${line1}\n${detailSuffixes.join(', ')}` : line1;
}

/**
 * Convert raw eval rows into latest-per-config chart rows for a benchmark/model/precision slice.
 * When `selectedRunDate` is omitted, all matching rows are considered and the latest row date
 * per config group is kept. This is used for unofficial-run overlays, which should render
 * independently of the official eval date picker.
 */
export function buildEvaluationChartRows(
  rawData: EvalRow[],
  selectedBenchmark: string | undefined,
  selectedModel: string | undefined,
  selectedPrecisions: string[],
  selectedRunDate?: string,
): EvaluationChartData[] {
  if (!selectedBenchmark || !selectedModel) return [];

  const dbModelKey = DISPLAY_MODEL_TO_DB[selectedModel];
  if (!dbModelKey) return [];

  const showPrecision = selectedPrecisions.length > 1;
  const allData = rawData
    .filter((item) => {
      return (
        item.task === selectedBenchmark &&
        item.model === dbModelKey &&
        (!selectedRunDate || item.date <= selectedRunDate) &&
        selectedPrecisions.includes(item.precision)
      );
    })
    .map((item): EvaluationChartData | null => {
      const score = item.metrics.em_strict ?? item.metrics.score ?? 0;
      if (score === 0) return null;

      const hwKey = normalizeEvalHardwareKey(
        item.hardware,
        item.framework,
        item.spec_method,
      ) as keyof typeof HARDWARE_CONFIG;
      if (hwKey === 'unknown') return null;

      const hwConfig = HARDWARE_CONFIG[hwKey];
      const hwLabel = String(hwConfig?.label || hwKey);

      return {
        configId: item.config_id,
        hwKey,
        configLabel: buildConfigLabel(
          hwLabel,
          item.framework,
          item.spec_method,
          item.precision,
          item.conc,
          item.decode_tp,
          showPrecision,
        ),
        score,
        scoreError: item.metrics.em_strict_se ?? item.metrics.score_se ?? 0,
        model: item.model,
        benchmark: item.task,
        specDecode: item.spec_method,
        date: item.date,
        datetime: item.timestamp ?? '',
        precision: item.precision,
        framework: item.framework,
        tp: item.decode_tp,
        ep: item.decode_ep,
        dp_attention: item.decode_dp_attention,
        conc: item.conc ?? 0,
        runUrl: item.run_url ?? undefined,
      };
    })
    .filter((item): item is EvaluationChartData => item !== null);

  const groupKeyFn = (item: EvaluationChartData) =>
    `${item.hwKey}_${item.framework}_${item.specDecode}_${item.precision}`;

  const latestDateForGroup = new Map<string, string>();
  for (const item of allData) {
    const key = groupKeyFn(item);
    const existing = latestDateForGroup.get(key);
    if (!existing || item.date > existing) latestDateForGroup.set(key, item.date);
  }

  return allData
    .filter((item) => item.date === latestDateForGroup.get(groupKeyFn(item)))
    .sort((a, b) => a.configLabel.localeCompare(b.configLabel));
}

/** Aggregate repeated eval rows by config label and keep min/max/error range metadata. */
export function aggregateEvaluationChartRows(
  unfilteredChartData: EvaluationChartData[],
  enabledHardware: Set<string>,
): EvaluationChartData[] {
  const grouped = new Map<string, EvaluationChartData[]>();
  for (const data of unfilteredChartData) {
    if (!enabledHardware.has(String(data.hwKey))) continue;
    if (!grouped.has(data.configLabel)) grouped.set(data.configLabel, []);
    grouped.get(data.configLabel)!.push(data);
  }

  return Array.from(grouped.values())
    .map((dataPoints) => {
      let sum = 0;
      let rawMin = Infinity;
      let rawMax = -Infinity;
      let errMin = Infinity;
      let errMax = -Infinity;

      for (const d of dataPoints) {
        sum += d.score;
        if (d.score < rawMin) rawMin = d.score;
        if (d.score > rawMax) rawMax = d.score;
        const lo = Math.max(0, d.score - (d.scoreError || 0));
        const hi = Math.min(1, d.score + (d.scoreError || 0));
        if (lo < errMin) errMin = lo;
        if (hi > errMax) errMax = hi;
      }

      const meanScore = sum / dataPoints.length;
      return {
        ...dataPoints[0],
        score: meanScore,
        scoreError: (errMax - errMin) / 2,
        minScore: rawMin,
        maxScore: rawMax,
        errorMin: errMin,
        errorMax: errMax,
      };
    })
    .sort(
      (a, b) =>
        getModelSortIndex(String(a.hwKey)) - getModelSortIndex(String(b.hwKey)) ||
        String(a.hwKey).localeCompare(String(b.hwKey)) ||
        a.configLabel.localeCompare(b.configLabel),
    );
}

export function buildEvalChangelogEntries(
  rawData: EvalRow[],
  selectedRunDate: string,
  selectedModel: string | undefined,
  selectedPrecisions: string[],
): EvalChangelogEntry[] {
  if (!selectedRunDate || !selectedModel) return [];

  const dbModelKey = DISPLAY_MODEL_TO_DB[selectedModel];
  if (!dbModelKey) return [];

  const showPrecision = selectedPrecisions.length > 1;
  const rows = rawData
    .filter((item) => {
      const score = item.metrics.em_strict ?? item.metrics.score ?? 0;
      return (
        item.date === selectedRunDate &&
        item.model === dbModelKey &&
        selectedPrecisions.includes(item.precision) &&
        score !== 0
      );
    })
    .map((item) => {
      const hwKey = normalizeEvalHardwareKey(item.hardware, item.framework, item.spec_method);
      const hwConfig = HARDWARE_CONFIG[hwKey as keyof typeof HARDWARE_CONFIG];
      const hwLabel = String(hwConfig?.label || hwKey);
      return {
        benchmark: item.task,
        configLabel: buildConfigLabel(
          hwLabel,
          item.framework,
          item.spec_method,
          item.precision,
          item.conc,
          undefined,
          showPrecision,
        ),
      };
    });

  const byBenchmark = new Map<string, Set<string>>();
  for (const item of rows) {
    if (!byBenchmark.has(item.benchmark)) byBenchmark.set(item.benchmark, new Set());
    byBenchmark.get(item.benchmark)!.add(item.configLabel);
  }

  return Array.from(byBenchmark.entries())
    .map(([benchmark, configs]) => ({ benchmark, configs: Array.from(configs).sort() }))
    .sort((a, b) => a.benchmark.localeCompare(b.benchmark));
}
