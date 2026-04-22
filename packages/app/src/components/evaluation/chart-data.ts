import { DISPLAY_MODEL_TO_DB } from '@semianalysisai/inferencex-constants';

import type { EvalChangelogEntry, EvaluationChartData } from '@/components/evaluation/types';
import type { EvalRow } from '@/lib/api';
import { normalizeEvalHardwareKey } from '@/lib/chart-utils';
import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';
import { getFrameworkLabel } from '@/lib/utils';

interface EvalLabelParams {
  disagg?: boolean;
  /** Decode-side (or single-node) TP. Not shown when undefined. */
  decodeTp?: number;
  /** Decode-side (or single-node) EP. Not shown when undefined. */
  decodeEp?: number;
  /** Decode-side (or single-node) DPA flag. */
  decodeDpa?: boolean;
  /** Decode-side worker count (disagg only). */
  decodeNw?: number;
  /** Prefill-side TP (disagg only). */
  prefillTp?: number;
  /** Prefill-side EP (disagg only). */
  prefillEp?: number;
  /** Prefill-side DPA flag (disagg only). */
  prefillDpa?: boolean;
  /** Prefill-side worker count (disagg only). */
  prefillNw?: number;
}

/** Format a disagg side's tuple positionally as `(tp/ep/dpa/nw)`. */
function fmtSide(
  side: 'P' | 'D',
  tp: number,
  ep: number,
  dpa: boolean | undefined,
  nw: number | undefined,
): string {
  return `${side}(${tp}/${ep}/${dpa ? 'T' : 'F'}/${nw ?? 1})`;
}

/**
 * Legend/x-axis label format:
 * - single-node: `{hw} ({framework}[, {spec}])\nC{conc} T{tp} E{ep} [DPA]`
 * - disagg:      `{hw} ({framework}[, {spec}])\nC{conc} P(tp/ep/dpa/nw) D(tp/ep/dpa/nw)`
 *
 * The P(…)/D(…) tuple format itself signals disagg (vs single-node's T#/E#).
 * Tuples are positional — the order `tp/ep/dpa/nw` is documented in the chart
 * caption so that legend items stay compact and uniformly shaped.
 */
function buildConfigLabel(
  hwLabel: string,
  framework: string,
  specMethod: string,
  precision: string,
  conc: number | null,
  params: EvalLabelParams,
  showPrecision: boolean,
): string {
  const headerSuffixes: string[] = [];
  if (framework && framework !== '1k8k') headerSuffixes.push(getFrameworkLabel(framework));
  if (specMethod && specMethod !== 'none') headerSuffixes.push(getFrameworkLabel(specMethod));

  const detailSuffixes: string[] = [];
  if (precision && showPrecision) detailSuffixes.push(precision.toUpperCase());
  if (conc) detailSuffixes.push(`C${conc}`);

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

      const hwConfig = getHardwareConfig(hwKey);
      const hwLabel = hwConfig.label;

      return {
        configId: item.config_id,
        hwKey,
        configLabel: buildConfigLabel(
          hwLabel,
          item.framework,
          item.spec_method,
          item.precision,
          item.conc,
          {
            disagg: item.disagg,
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

  // Dedup by configId so each distinct config (unique prefill/decode geometry,
  // spec method, precision, etc.) gets its own "latest date" slot. Prior code
  // keyed by (hwKey, framework, spec, precision), which coalesced disagg
  // variants and risked dropping one's history when another backfilled.
  const latestDateForConfig = new Map<number, string>();
  for (const item of allData) {
    const existing = latestDateForConfig.get(item.configId);
    if (!existing || item.date > existing) latestDateForConfig.set(item.configId, item.date);
  }

  return allData
    .filter((item) => item.date === latestDateForConfig.get(item.configId))
    .toSorted((a, b) => a.configLabel.localeCompare(b.configLabel));
}

/**
 * Aggregate repeated eval rows for the same config (retries, reruns on the same
 * date, etc.) into a single data point with min/max/error range metadata.
 *
 * Grouping is by `configId` rather than `configLabel`: two distinct configs
 * could theoretically render the same label — `configId` keys directly off the
 * row identity from the configs natural key.
 */
export function aggregateEvaluationChartRows(
  unfilteredChartData: EvaluationChartData[],
  enabledHardware: Set<string>,
): EvaluationChartData[] {
  const grouped = new Map<number, EvaluationChartData[]>();
  for (const data of unfilteredChartData) {
    if (!enabledHardware.has(String(data.hwKey))) continue;
    if (!grouped.has(data.configId)) grouped.set(data.configId, []);
    grouped.get(data.configId)!.push(data);
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
      const hwConfig = getHardwareConfig(hwKey);
      const hwLabel = hwConfig.label;
      // Changelog labels historically omit TP/EP; keep that behavior while
      // still surfacing the disagg marker.
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
            prefillDpa: item.prefill_dp_attention,
            decodeDpa: item.decode_dp_attention,
          },
          showPrecision,
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
