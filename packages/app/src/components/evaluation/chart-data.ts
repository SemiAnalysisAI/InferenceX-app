import {
  DISPLAY_MODEL_TO_DB,
  resolveFrameworkPartLabel,
} from '@semianalysisai/inferencex-constants';

import type { EvalChangelogEntry, EvaluationChartData } from '@/components/evaluation/types';
import type { EvalRow } from '@/lib/api/api';
import { normalizeEvalHardwareKey } from '@/lib/charts/chart-utils';
import { getHardwareConfig, getModelSortIndex } from '@/lib/catalog/constants';
import { getFrameworkLabel } from '@/lib/shared/utils';

interface EvalLabelParams {
  dp?: number;
  disagg?: boolean;
  decodeTp?: number;
  decodeEp?: number;
  decodeDpa?: boolean;
  decodeNw?: number;
  prefillTp?: number;
  prefillEp?: number;
  prefillDpa?: boolean;
  prefillNw?: number;
}

function fmtSide(
  side: 'P' | 'D',
  tp: number,
  ep: number,
  dpa: boolean | undefined,
  nw: number | undefined,
): string {
  return `${side}(${tp}/${ep}/${dpa ? 'T' : 'F'}/${nw ?? 1})`;
}

function buildConfigLabel(
  hwLabel: string,
  framework: string,
  specMethod: string,
  precision: string,
  conc: number | null,
  params: EvalLabelParams,
  showPrecision: boolean,
  model?: string,
): string {
  const headerSuffixes: string[] = [];
  if (framework && framework !== '1k8k') headerSuffixes.push(getFrameworkLabel(framework));
  if (specMethod && specMethod !== 'none')
    headerSuffixes.push(resolveFrameworkPartLabel(model, specMethod));

  const detailSuffixes: string[] = [];
  if (precision && showPrecision) detailSuffixes.push(precision.toUpperCase());
  if (conc) detailSuffixes.push(`C${conc}`);

  if (params.dp && params.dp > 1) detailSuffixes.push(`DP${params.dp}`);
  if (params.disagg) {
    if (params.prefillTp !== undefined && params.prefillEp !== undefined) {
      detailSuffixes.push(
        fmtSide('P', params.prefillTp, params.prefillEp, params.prefillDpa, params.prefillNw),
      );
    }
    if (params.decodeTp !== undefined && params.decodeEp !== undefined) {
      detailSuffixes.push(
        fmtSide('D', params.decodeTp, params.decodeEp, params.decodeDpa, params.decodeNw),
      );
    }
  } else {
    if (params.decodeTp !== undefined) detailSuffixes.push(`T${params.decodeTp}`);
    if (params.decodeEp !== undefined) detailSuffixes.push(`E${params.decodeEp}`);
    if (params.decodeDpa) detailSuffixes.push('DPA');
  }

  const line1 = headerSuffixes.length > 0 ? `${hwLabel} (${headerSuffixes.join(', ')})` : hwLabel;
  return detailSuffixes.length > 0 ? `${line1}\n${detailSuffixes.join(' ')}` : line1;
}

export function buildEvaluationChartRows(
  rawData: EvalRow[],
  selectedBenchmark: string | undefined,
  selectedModel: string | undefined,
  selectedPrecisions: string[],
  selectedRunDate?: string,
): EvaluationChartData[] {
  if (!selectedBenchmark || !selectedModel) return [];

  const dbModelKeys = DISPLAY_MODEL_TO_DB[selectedModel];
  if (!dbModelKeys || dbModelKeys.length === 0) return [];

  const showPrecision = selectedPrecisions.length > 1;
  const allData = rawData
    .filter(
      (item) =>
        item.task === selectedBenchmark &&
        dbModelKeys.includes(item.model) &&
        (!selectedRunDate || item.date <= selectedRunDate) &&
        selectedPrecisions.includes(item.precision),
    )
    .map((item): EvaluationChartData | null => {
      const score = item.metrics.em_strict ?? item.metrics.score;
      if (score === undefined) {
        console.warn(
          `[evaluation] dropped row with missing metrics: config_id=${item.config_id} ${item.hardware} ${item.framework} ${item.task}`,
        );
        return null;
      }

      const hwKey = normalizeEvalHardwareKey(item.hardware, item.framework, item.spec_method);
      if (hwKey === 'unknown') {
        console.warn(
          `[evaluation] dropped row with unknown hardware mapping: hardware=${item.hardware} framework=${item.framework} spec=${item.spec_method}`,
        );
        return null;
      }

      const hwConfig = getHardwareConfig(hwKey, selectedModel);
      const hwLabel = hwConfig.label;

      return {
        evalResultId: item.id,
        configId: item.config_id,
        hwKey,
        hardware: item.hardware,
        configLabel: buildConfigLabel(
          hwLabel,
          item.framework,
          item.spec_method,
          item.precision,
          item.conc,
          {
            disagg: item.disagg,
            dp: item.metrics.dp,
            decodeTp: item.decode_tp,
            decodeEp: item.decode_ep,
            decodeDpa: item.decode_dp_attention,
            decodeNw: item.decode_num_workers,
            prefillTp: item.prefill_tp,
            prefillEp: item.prefill_ep,
            prefillDpa: item.prefill_dp_attention,
            prefillNw: item.prefill_num_workers,
          },
          showPrecision,
          selectedModel,
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
        dp: item.metrics.dp,
        physicalChips: item.disagg
          ? item.num_prefill_gpu + item.num_decode_gpu
          : item.num_decode_gpu,
        ep: item.decode_ep,
        dp_attention: item.decode_dp_attention,
        conc: item.conc ?? 0,
        disagg: item.disagg,
        isMultinode: item.is_multinode,
        prefillTp: item.prefill_tp,
        prefillEp: item.prefill_ep,
        prefillDpAttention: item.prefill_dp_attention,
        prefillNumWorkers: item.prefill_num_workers,
        decodeNumWorkers: item.decode_num_workers,
        numPrefillGpu: item.num_prefill_gpu,
        numDecodeGpu: item.num_decode_gpu,
        runUrl: item.run_url ?? undefined,
      };
    })
    .filter((item): item is EvaluationChartData => item !== null);

  const latestDateForConfig = new Map<string, string>();
  for (const item of allData) {
    const key = `${item.configId}|${item.conc}`;
    const existing = latestDateForConfig.get(key);
    if (!existing || item.date > existing) latestDateForConfig.set(key, item.date);
  }

  return allData
    .filter((item) => item.date === latestDateForConfig.get(`${item.configId}|${item.conc}`))
    .toSorted((a, b) => a.configLabel.localeCompare(b.configLabel));
}

export function aggregateEvaluationChartRows(
  unfilteredChartData: EvaluationChartData[],
  enabledHardware: Set<string>,
): EvaluationChartData[] {
  const grouped = new Map<string, EvaluationChartData[]>();
  for (const data of unfilteredChartData) {
    if (!enabledHardware.has(String(data.hwKey))) continue;
    const key = `${data.configId}|${data.conc}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(data);
  }

  return [...grouped.values()]
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
      const latest = dataPoints.reduce(
        (best, d) => (d.evalResultId > best.evalResultId ? d : best),
        dataPoints[0],
      );
      return {
        ...dataPoints[0],
        evalResultId: latest.evalResultId,
        score: meanScore,
        scoreError: (errMax - errMin) / 2,
        minScore: rawMin,
        maxScore: rawMax,
        errorMin: errMin,
        errorMax: errMax,
      };
    })
    .toSorted(
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

  const dbModelKeys = DISPLAY_MODEL_TO_DB[selectedModel];
  if (!dbModelKeys || dbModelKeys.length === 0) return [];

  const showPrecision = selectedPrecisions.length > 1;
  const rows = rawData
    .filter((item) => {
      const rawScore = item.metrics.em_strict ?? item.metrics.score;
      return (
        item.date === selectedRunDate &&
        dbModelKeys.includes(item.model) &&
        selectedPrecisions.includes(item.precision) &&
        rawScore !== undefined
      );
    })
    .map((item) => {
      const hwKey = normalizeEvalHardwareKey(item.hardware, item.framework, item.spec_method);
      const hwConfig = getHardwareConfig(hwKey, selectedModel);
      const hwLabel = hwConfig.label;
      return {
        benchmark: item.task,
        configLabel: buildConfigLabel(
          hwLabel,
          item.framework,
          item.spec_method,
          item.precision,
          item.conc,
          {
            disagg: item.disagg,
            dp: item.metrics.dp,
            prefillDpa: item.prefill_dp_attention,
            decodeDpa: item.decode_dp_attention,
          },
          showPrecision,
          selectedModel,
        ),
      };
    });

  const byBenchmark = new Map<string, Set<string>>();
  for (const item of rows) {
    if (!byBenchmark.has(item.benchmark)) byBenchmark.set(item.benchmark, new Set());
    byBenchmark.get(item.benchmark)!.add(item.configLabel);
  }

  return [...byBenchmark.entries()]
    .map(([benchmark, configs]) => ({ benchmark, configs: [...configs].toSorted() }))
    .toSorted((a, b) => a.benchmark.localeCompare(b.benchmark));
}
