'use client';

import { useCallback, useState } from 'react';

import {
  validateSpec,
  type AiChartBarPoint,
  type AiChartSpec,
  type AiProvider,
} from '@/components/ai-chart/types';
import { buildParsePrompt, buildSummaryPrompt } from '@/components/ai-chart/prompt-templates';
import type { InferenceData } from '@/components/inference/types';
import { callLlm } from '@/lib/ai-providers';
import {
  fetchBenchmarks,
  fetchBenchmarkHistory,
  fetchEvaluations,
  fetchReliability,
  type EvalRow,
  type ReliabilityRow,
} from '@/lib/api';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import {
  getNestedYValue,
  normalizeEvalHardwareKey,
  generateHighContrastColors,
} from '@/lib/chart-utils';
import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';

import chartDefinitions from '@/components/inference/inference-chart-config.json';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface AiRadarItem {
  hwKey: string;
  label: string;
  color: string;
  values: (number | null)[];
  rawValues: (number | null)[];
}

export interface AiSingleChartResult {
  spec: AiChartSpec;
  barData: AiChartBarPoint[];
  scatterData: InferenceData[];
  lineData: Record<string, { x: number; y: number }[]>;
  radarData: AiRadarItem[];
  radarAxes: { label: string; unit?: string }[];
  colorMap: Record<string, string>;
}

export interface AiChartResult {
  charts: AiSingleChartResult[];
  summary: string | null;
}

interface UseAiChartReturn {
  result: AiChartResult | null;
  isLoading: boolean;
  error: string | null;
  generate: (prompt: string, provider: AiProvider, apiKey: string) => Promise<void>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// LLM response parsing
// ---------------------------------------------------------------------------

function parseSpecsFromLlm(raw: string): AiChartSpec[] {
  const cleaned = raw
    .replaceAll(/```json\s*/gu, '')
    .replaceAll('```', '')
    .trim();
  const parsed = JSON.parse(cleaned);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  // Validate each spec and limit to 2
  return arr.slice(0, 2).map((s: unknown) => validateSpec(s as Record<string, unknown>));
}

function sortBars(bars: AiChartBarPoint[], order: AiChartSpec['sortOrder']): void {
  if (order === 'asc') bars.sort((a, b) => a.value - b.value);
  else if (order === 'desc') bars.sort((a, b) => b.value - a.value);
  else bars.sort((a, b) => getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey));
}

// ---------------------------------------------------------------------------
// Benchmark helpers
// ---------------------------------------------------------------------------

function buildBenchmarkBarData(
  data: InferenceData[],
  spec: AiChartSpec,
  colorMap: Record<string, string>,
): AiChartBarPoint[] {
  const target = spec.targetInteractivity ?? 40;
  const chartDef = (chartDefinitions as any[])[0];
  const yFieldPath: string = chartDef[spec.yAxisMetric] ?? 'tpPerGpu.y';

  const groups = new Map<string, InferenceData[]>();
  for (const point of data) {
    const key = point.hwKey ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(point);
  }

  const bars: AiChartBarPoint[] = [];
  for (const [hwKey, points] of groups) {
    let closest = points[0];
    let closestDist = Math.abs(closest.x - target);
    for (let i = 1; i < points.length; i++) {
      const dist = Math.abs(points[i].x - target);
      if (dist < closestDist) {
        closest = points[i];
        closestDist = dist;
      }
    }

    const value = getNestedYValue(closest, yFieldPath);
    if (value <= 0) continue;

    const config = getHardwareConfig(hwKey);
    bars.push({
      hwKey,
      label: config ? `${config.label}${config.suffix ? ` ${config.suffix}` : ''}` : hwKey,
      value,
      color: colorMap[hwKey] ?? '#888',
    });
  }

  sortBars(bars, spec.sortOrder);
  return bars;
}

function parseSeqPart(s: string): number {
  return s.includes('8k') ? 8192 : 1024;
}

function sequenceToIslOsl(seq: string): { isl: number; osl: number } {
  const parts = seq.split('/');
  return { isl: parseSeqPart(parts[0] ?? '1k'), osl: parseSeqPart(parts[1] ?? '1k') };
}

// ---------------------------------------------------------------------------
// Evaluation helpers
// ---------------------------------------------------------------------------

function buildEvalBarData(
  rows: EvalRow[],
  spec: AiChartSpec,
  colorMap: Record<string, string>,
): AiChartBarPoint[] {
  let filtered = rows.filter((r) => r.model === spec.model || spec.model === '');
  if (spec.hardwareKeys.length > 0) {
    const allowed = new Set(spec.hardwareKeys);
    filtered = filtered.filter((r) => {
      const hw = r.hardware.toLowerCase();
      return allowed.has(hw) || [...allowed].some((g) => hw.startsWith(g));
    });
  }
  if (spec.precisions.length > 0) {
    const allowed = new Set(spec.precisions.map((p) => p.toLowerCase()));
    filtered = filtered.filter((r) => allowed.has(r.precision.toLowerCase()));
  }

  const groups = new Map<string, EvalRow>();
  for (const row of filtered) {
    const hwKey = normalizeEvalHardwareKey(row.hardware, row.framework, row.spec_method);
    const existing = groups.get(hwKey);
    if (!existing || row.date > existing.date) {
      groups.set(hwKey, row);
    }
  }

  const bars: AiChartBarPoint[] = [];
  for (const [hwKey, row] of groups) {
    const score = row.metrics.gsm8k ?? row.metrics.accuracy ?? Object.values(row.metrics)[0] ?? 0;
    if (score <= 0) continue;

    const config = getHardwareConfig(hwKey);
    bars.push({
      hwKey,
      label: config ? `${config.label}${config.suffix ? ` ${config.suffix}` : ''}` : hwKey,
      value: score,
      color: colorMap[hwKey] ?? '#888',
    });
  }

  sortBars(bars, spec.sortOrder);
  return bars;
}

// ---------------------------------------------------------------------------
// Reliability helpers
// ---------------------------------------------------------------------------

function buildReliabilityBarData(
  rows: ReliabilityRow[],
  spec: AiChartSpec,
  colorMap: Record<string, string>,
): AiChartBarPoint[] {
  let filtered = rows;
  if (spec.hardwareKeys.length > 0) {
    const allowed = new Set(spec.hardwareKeys);
    filtered = filtered.filter((r) => {
      const hw = r.hardware.toLowerCase();
      return allowed.has(hw) || [...allowed].some((g) => hw.startsWith(g));
    });
  }

  const agg = new Map<string, { success: number; total: number }>();
  for (const row of filtered) {
    const hw = row.hardware;
    const existing = agg.get(hw) ?? { success: 0, total: 0 };
    existing.success += row.n_success;
    existing.total += row.total;
    agg.set(hw, existing);
  }

  const bars: AiChartBarPoint[] = [];
  for (const [hw, { success, total }] of agg) {
    if (total === 0) continue;
    const rate = (success / total) * 100;
    const config = getHardwareConfig(hw);
    bars.push({
      hwKey: hw,
      label: config ? `${config.label}${config.suffix ? ` ${config.suffix}` : ''}` : hw,
      value: Math.round(rate * 100) / 100,
      color: colorMap[hw] ?? '#888',
    });
  }

  sortBars(bars, spec.sortOrder);
  return bars;
}

// ---------------------------------------------------------------------------
// Resolve a single spec into chart data
// ---------------------------------------------------------------------------

const METRIC_LABELS: Record<string, string> = {
  y_tpPerGpu: 'Throughput/GPU',
  y_outputTputPerGpu: 'Output Tput/GPU',
  y_inputTputPerGpu: 'Input Tput/GPU',
  y_tpPerMw: 'Tput/MW',
  y_costh: 'Cost (Hyper)',
  y_costn: 'Cost (Neo)',
  y_costr: 'Cost (Rental)',
  y_jTotal: 'J/Token',
  y_jOutput: 'J/Output',
  y_jInput: 'J/Input',
};

const EMPTY_RESULT: Pick<AiSingleChartResult, 'lineData' | 'radarData' | 'radarAxes'> = {
  lineData: {},
  radarData: [],
  radarAxes: [],
};

function buildLineData(
  points: InferenceData[],
  spec: AiChartSpec,
  colorMap: Record<string, string>,
): Record<string, { x: number; y: number }[]> {
  const chartDef = (chartDefinitions as any[])[0];
  const yFieldPath: string = chartDef[spec.yAxisMetric] ?? 'tpPerGpu.y';

  const lines: Record<string, { x: number; y: number }[]> = {};
  for (const p of points) {
    const hwKey = p.hwKey ?? '';
    if (!hwKey || !colorMap[hwKey]) continue;
    if (!lines[hwKey]) lines[hwKey] = [];
    lines[hwKey].push({ x: p.x, y: getNestedYValue(p, yFieldPath) });
  }
  // Sort each line by x
  for (const pts of Object.values(lines)) {
    pts.sort((a, b) => a.x - b.x);
  }
  return lines;
}

function buildRadarData(
  points: InferenceData[],
  spec: AiChartSpec,
  colorMap: Record<string, string>,
): { items: AiRadarItem[]; axes: { label: string; unit?: string }[] } {
  const metrics = spec.radarMetrics ?? ['y_tpPerGpu', 'y_outputTputPerGpu', 'y_costh', 'y_jTotal'];
  const chartDef = (chartDefinitions as any[])[0];
  const target = spec.targetInteractivity ?? 40;

  // Group by hwKey and pick the point closest to target interactivity
  const groups = new Map<string, InferenceData>();
  for (const p of points) {
    const hwKey = p.hwKey ?? '';
    if (!hwKey) continue;
    const existing = groups.get(hwKey);
    if (!existing || Math.abs(p.x - target) < Math.abs(existing.x - target)) {
      groups.set(hwKey, p);
    }
  }

  // Extract raw values per metric per GPU
  const rawMatrix = new Map<string, number[]>();
  for (const [hwKey, point] of groups) {
    const vals = metrics.map((m) => {
      const path: string = chartDef[m] ?? m;
      return getNestedYValue(point, path);
    });
    rawMatrix.set(hwKey, vals);
  }

  // Find min/max per metric for normalization
  const mins = metrics.map(() => Infinity);
  const maxs = metrics.map(() => -Infinity);
  for (const vals of rawMatrix.values()) {
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] > 0) {
        mins[i] = Math.min(mins[i], vals[i]);
        maxs[i] = Math.max(maxs[i], vals[i]);
      }
    }
  }

  // For cost/energy metrics, invert normalization (lower is better)
  const invertMetric = new Set([
    'y_costh',
    'y_costn',
    'y_costr',
    'y_jTotal',
    'y_jOutput',
    'y_jInput',
  ]);

  const items: AiRadarItem[] = [];
  for (const [hwKey, rawVals] of rawMatrix) {
    const config = getHardwareConfig(hwKey);
    const normalized = rawVals.map((v, i) => {
      if (v <= 0 || !isFinite(mins[i]) || maxs[i] === mins[i]) return null;
      const norm = (v - mins[i]) / (maxs[i] - mins[i]);
      return invertMetric.has(metrics[i]) ? 1 - norm : norm;
    });
    items.push({
      hwKey,
      label: config ? `${config.label}${config.suffix ? ` ${config.suffix}` : ''}` : hwKey,
      color: colorMap[hwKey] ?? '#888',
      values: normalized,
      rawValues: rawVals.map((v) => (v > 0 ? v : null)),
    });
  }

  const axes = metrics.map((m) => ({ label: METRIC_LABELS[m] ?? m }));
  return { items, axes };
}

async function resolveSpec(spec: AiChartSpec): Promise<AiSingleChartResult> {
  if (spec.dataSource === 'evaluations') {
    const rows = await fetchEvaluations();
    const hwKeys = [
      ...new Set(rows.map((r) => normalizeEvalHardwareKey(r.hardware, r.framework, r.spec_method))),
    ];
    const colorMap = generateHighContrastColors(hwKeys, 'dark');
    const barData = buildEvalBarData(rows, spec, colorMap);
    const finalKeys = barData.map((b) => b.hwKey);
    const finalColors = generateHighContrastColors(finalKeys, 'dark');
    return {
      spec,
      barData: barData.map((b) => ({ ...b, color: finalColors[b.hwKey] ?? b.color })),
      scatterData: [],
      ...EMPTY_RESULT,
      colorMap: finalColors,
    };
  }

  if (spec.dataSource === 'reliability') {
    const rows = await fetchReliability();
    const hwKeys = [...new Set(rows.map((r) => r.hardware))];
    const colorMap = generateHighContrastColors(hwKeys, 'dark');
    const barData = buildReliabilityBarData(rows, spec, colorMap);
    const finalKeys = barData.map((b) => b.hwKey);
    const finalColors = generateHighContrastColors(finalKeys, 'dark');
    return {
      spec,
      barData: barData.map((b) => ({ ...b, color: finalColors[b.hwKey] ?? b.color })),
      scatterData: [],
      ...EMPTY_RESULT,
      colorMap: finalColors,
    };
  }

  // Benchmarks or History
  const { isl, osl } = sequenceToIslOsl(spec.sequence);
  const rows =
    spec.dataSource === 'history'
      ? await fetchBenchmarkHistory(spec.model, isl, osl)
      : await fetchBenchmarks(spec.model);

  const { chartData } = transformBenchmarkRows(rows);
  let points = chartData[0] ?? [];

  if (spec.hardwareKeys.length > 0) {
    const allowedGpus = new Set(spec.hardwareKeys);
    points = points.filter((p) => {
      const hwKey = p.hwKey ?? '';
      return allowedGpus.has(hwKey) || [...allowedGpus].some((g) => hwKey.startsWith(g));
    });
  }
  if (spec.precisions.length > 0) {
    const allowedPrec = new Set(spec.precisions.map((p) => p.toLowerCase()));
    points = points.filter((p) => p.precision && allowedPrec.has(p.precision.toLowerCase()));
  }
  if (spec.frameworks.length > 0) {
    const allowedFw = new Set(spec.frameworks.map((f) => f.toLowerCase()));
    points = points.filter((p) => {
      const hwKey = p.hwKey ?? '';
      const parts = hwKey.split('_').slice(1);
      return parts.some((part) => allowedFw.has(part));
    });
  }
  if (spec.disagg !== null) {
    points = points.filter((p) => {
      const hwKey = p.hwKey ?? '';
      const isDisagg = hwKey.includes('-disagg');
      return spec.disagg ? isDisagg : !isDisagg;
    });
  }

  if (spec.dataSource !== 'history') {
    points = points.filter((p) => {
      const entry = p as any;
      if (
        entry.isl !== undefined &&
        entry.isl !== null &&
        entry.osl !== undefined &&
        entry.osl !== null
      ) {
        return entry.isl === isl && entry.osl === osl;
      }
      return true;
    });
  }

  // topN: rank configs by peak metric value and keep only the best N
  if (spec.topN) {
    const chartDef = (chartDefinitions as any[])[0];
    const yFieldPath: string = chartDef[spec.yAxisMetric] ?? 'tpPerGpu.y';
    const peakByHw = new Map<string, number>();
    for (const p of points) {
      const hw = p.hwKey ?? '';
      if (!hw) continue;
      const val = getNestedYValue(p, yFieldPath);
      peakByHw.set(hw, Math.max(peakByHw.get(hw) ?? 0, val));
    }

    let topHwKeys: Set<string>;
    if (spec.topNDistinctGpus === false) {
      // Rank individual configs regardless of GPU family
      topHwKeys = new Set(
        [...peakByHw.entries()]
          .toSorted(([, a], [, b]) => b - a)
          .slice(0, spec.topN)
          .map(([k]) => k),
      );
    } else {
      // Group by base GPU, pick the best config per GPU, then take top N GPUs
      const bestPerGpu = new Map<string, { hwKey: string; peak: number }>();
      for (const [hwKey, peak] of peakByHw) {
        const base = hwKey.split('_')[0];
        const existing = bestPerGpu.get(base);
        if (!existing || peak > existing.peak) {
          bestPerGpu.set(base, { hwKey, peak });
        }
      }
      const topBases = [...bestPerGpu.entries()]
        .toSorted(([, a], [, b]) => b.peak - a.peak)
        .slice(0, spec.topN);
      // Include only the single best config per winning GPU
      topHwKeys = new Set(topBases.map(([, v]) => v.hwKey));
    }
    points = points.filter((p) => topHwKeys.has(p.hwKey ?? ''));
  }

  const hwKeys = [...new Set(points.map((p) => p.hwKey ?? '').filter(Boolean))];
  const colorMap = generateHighContrastColors(hwKeys, 'dark');

  const lineData = spec.chartType === 'line' ? buildLineData(points, spec, colorMap) : {};
  const { items: radarData, axes: radarAxes } =
    spec.chartType === 'radar' ? buildRadarData(points, spec, colorMap) : { items: [], axes: [] };

  return {
    spec,
    barData: spec.chartType === 'bar' ? buildBenchmarkBarData(points, spec, colorMap) : [],
    scatterData: spec.chartType === 'scatter' ? points : [],
    lineData,
    radarData,
    radarAxes,
    colorMap,
  };
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function useAiChart(): UseAiChartReturn {
  const [result, setResult] = useState<AiChartResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (prompt: string, provider: AiProvider, apiKey: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Step 1: Parse prompt into validated spec(s)
      const rawResponse = await callLlm(provider, apiKey, buildParsePrompt(), prompt);
      const specs = parseSpecsFromLlm(rawResponse);

      if (specs.length === 0) {
        setError('Could not parse your request. Try rephrasing.');
        setIsLoading(false);
        return;
      }

      // Step 2: Resolve each spec into chart data (parallel for multi-chart)
      const charts = await Promise.all(specs.map(resolveSpec));

      // Check if any chart has data
      const hasData = charts.some(
        (c) =>
          c.barData.length > 0 ||
          c.scatterData.length > 0 ||
          Object.keys(c.lineData).length > 0 ||
          c.radarData.length > 0,
      );
      if (!hasData) {
        const models = [...new Set(specs.map((s) => s.model))].join(', ');
        setError(`No data found for ${models}. Try a different model or configuration.`);
        setIsLoading(false);
        return;
      }

      // Step 3: Generate summary (best-effort)
      let summary: string | null = null;
      try {
        const allBars = charts.flatMap((c) => c.barData);
        const allScatter = charts.flatMap((c) => c.scatterData);
        const hwKeys = [
          ...new Set([...allBars.map((b) => b.hwKey), ...allScatter.map((p) => p.hwKey ?? '')]),
        ].filter(Boolean);

        const dataDesc =
          allBars.length > 0
            ? allBars.map((b) => `${b.label}: ${b.value.toFixed(2)}`).join('\n')
            : `${allScatter.length} data points across ${hwKeys.length} hardware configs`;

        const summaryRaw = await callLlm(
          provider,
          apiKey,
          buildSummaryPrompt(specs, dataDesc),
          'Provide the summary.',
        );
        summary = summaryRaw.trim();
      } catch {
        // Summary generation is non-critical
      }

      setResult({ charts, summary });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'An unexpected error occurred.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, isLoading, error, generate, reset };
}
