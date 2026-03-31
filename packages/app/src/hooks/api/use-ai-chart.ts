'use client';

import { useCallback, useState } from 'react';

import type { AiChartBarPoint, AiChartSpec, AiProvider } from '@/components/ai-chart/types';
import { validateSpec } from '@/components/ai-chart/types';
import { buildParsePrompt, buildSummaryPrompt } from '@/components/ai-chart/prompt-templates';
import type { InferenceData } from '@/components/inference/types';
import { callLlm } from '@/lib/ai-providers';
import {
  fetchBenchmarks,
  fetchBenchmarkHistory,
  fetchEvaluations,
  fetchReliability,
} from '@/lib/api';
import type { EvalRow, ReliabilityRow } from '@/lib/api';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import { getNestedYValue, normalizeEvalHardwareKey } from '@/lib/chart-utils';
import { generateHighContrastColors } from '@/lib/chart-utils';
import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';

import chartDefinitions from '@/components/inference/inference-chart-config.json';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface AiSingleChartResult {
  spec: AiChartSpec;
  barData: AiChartBarPoint[];
  scatterData: InferenceData[];
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
    .replace(/```json\s*/g, '')
    .replace(/```/g, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  // Validate each spec and limit to 2
  return arr.slice(0, 2).map((s: unknown) => validateSpec(s as Record<string, unknown>));
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
      label: config ? `${config.label}${config.suffix ? ' ' + config.suffix : ''}` : hwKey,
      value,
      color: colorMap[hwKey] ?? '#888',
    });
  }

  bars.sort((a, b) => getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey));
  return bars;
}

function sequenceToIslOsl(seq: string): { isl: number; osl: number } {
  const parts = seq.split('/');
  const parse = (s: string) => (s.includes('8k') ? 8192 : 1024);
  return { isl: parse(parts[0] ?? '1k'), osl: parse(parts[1] ?? '1k') };
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
      label: config ? `${config.label}${config.suffix ? ' ' + config.suffix : ''}` : hwKey,
      value: score,
      color: colorMap[hwKey] ?? '#888',
    });
  }

  bars.sort((a, b) => getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey));
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
      label: config ? `${config.label}${config.suffix ? ' ' + config.suffix : ''}` : hw,
      value: Math.round(rate * 100) / 100,
      color: colorMap[hw] ?? '#888',
    });
  }

  bars.sort((a, b) => getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey));
  return bars;
}

// ---------------------------------------------------------------------------
// Resolve a single spec into chart data
// ---------------------------------------------------------------------------

async function resolveSpec(spec: AiChartSpec): Promise<AiSingleChartResult> {
  if (spec.dataSource === 'evaluations') {
    const rows = await fetchEvaluations();
    const hwKeys = [
      ...new Set(rows.map((r) => normalizeEvalHardwareKey(r.hardware, r.framework, r.spec_method))),
    ];
    const colorMap = generateHighContrastColors(hwKeys, 'dark');
    const barData = buildEvalBarData(rows, spec, colorMap);
    // Re-color with final keys
    const finalKeys = barData.map((b) => b.hwKey);
    const finalColors = generateHighContrastColors(finalKeys, 'dark');
    return {
      spec,
      barData: barData.map((b) => ({ ...b, color: finalColors[b.hwKey] ?? b.color })),
      scatterData: [],
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

  if (spec.dataSource !== 'history') {
    points = points.filter((p) => {
      const entry = p as any;
      if (entry.isl != null && entry.osl != null) {
        return entry.isl === isl && entry.osl === osl;
      }
      return true;
    });
  }

  const hwKeys = [...new Set(points.map((p) => p.hwKey ?? '').filter(Boolean))];
  const colorMap = generateHighContrastColors(hwKeys, 'dark');

  return {
    spec,
    barData: spec.chartType === 'bar' ? buildBenchmarkBarData(points, spec, colorMap) : [],
    scatterData: spec.chartType === 'scatter' ? points : [],
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
      const hasData = charts.some((c) => c.barData.length > 0 || c.scatterData.length > 0);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
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
