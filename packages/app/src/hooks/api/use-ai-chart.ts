'use client';

import { useCallback, useState } from 'react';

import type { AiChartBarPoint, AiChartSpec, AiProvider } from '@/components/ai-chart/types';
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

interface AiChartResult {
  spec: AiChartSpec;
  barData: AiChartBarPoint[];
  scatterData: InferenceData[];
  colorMap: Record<string, string>;
  summary: string | null;
}

interface UseAiChartReturn {
  result: AiChartResult | null;
  isLoading: boolean;
  error: string | null;
  generate: (prompt: string, provider: AiProvider, apiKey: string) => Promise<void>;
  reset: () => void;
}

function parseSpecFromLlm(raw: string): AiChartSpec {
  const cleaned = raw
    .replace(/```json\s*/g, '')
    .replace(/```/g, '')
    .trim();
  return JSON.parse(cleaned);
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
  // Filter by model, hardware, precision
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

  // Group by hardware key, take latest date per group, extract score
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
    // GSM8K score is typically in metrics as "gsm8k" or first metric value
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
  // Filter by hardware
  let filtered = rows;
  if (spec.hardwareKeys.length > 0) {
    const allowed = new Set(spec.hardwareKeys);
    filtered = filtered.filter((r) => {
      const hw = r.hardware.toLowerCase();
      return allowed.has(hw) || [...allowed].some((g) => hw.startsWith(g));
    });
  }

  // Aggregate across dates: total successes / total attempts per hardware
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
      // Step 1: Parse prompt into spec
      const rawSpec = await callLlm(provider, apiKey, buildParsePrompt(), prompt);
      const spec = parseSpecFromLlm(rawSpec);
      // Default dataSource for backwards compat
      if (!spec.dataSource) spec.dataSource = 'benchmarks';

      let barData: AiChartBarPoint[] = [];
      let scatterData: InferenceData[] = [];
      let hwKeys: string[] = [];

      if (spec.dataSource === 'evaluations') {
        // ---- Evaluations ----
        const rows = await fetchEvaluations();
        hwKeys = [
          ...new Set(
            rows.map((r) => normalizeEvalHardwareKey(r.hardware, r.framework, r.spec_method)),
          ),
        ];
        const colorMap = generateHighContrastColors(hwKeys, 'dark');
        barData = buildEvalBarData(rows, spec, colorMap);

        if (barData.length === 0) {
          setError('No evaluation data found for the requested configuration.');
          setIsLoading(false);
          return;
        }

        hwKeys = barData.map((b) => b.hwKey);
        const finalColorMap = generateHighContrastColors(hwKeys, 'dark');
        barData = barData.map((b) => ({ ...b, color: finalColorMap[b.hwKey] ?? b.color }));

        await generateSummary(provider, apiKey, spec, barData, finalColorMap, setResult);
        return;
      }

      if (spec.dataSource === 'reliability') {
        // ---- Reliability ----
        const rows = await fetchReliability();
        hwKeys = [...new Set(rows.map((r) => r.hardware))];
        const colorMap = generateHighContrastColors(hwKeys, 'dark');
        barData = buildReliabilityBarData(rows, spec, colorMap);

        if (barData.length === 0) {
          setError('No reliability data found for the requested configuration.');
          setIsLoading(false);
          return;
        }

        hwKeys = barData.map((b) => b.hwKey);
        const finalColorMap = generateHighContrastColors(hwKeys, 'dark');
        barData = barData.map((b) => ({ ...b, color: finalColorMap[b.hwKey] ?? b.color }));

        await generateSummary(provider, apiKey, spec, barData, finalColorMap, setResult);
        return;
      }

      // ---- Benchmarks (default) & History ----
      const { isl, osl } = sequenceToIslOsl(spec.sequence);
      const rows =
        spec.dataSource === 'history'
          ? await fetchBenchmarkHistory(spec.model, isl, osl)
          : await fetchBenchmarks(spec.model);

      const { chartData } = transformBenchmarkRows(rows);
      let points = chartData[0] ?? [];

      // Filter by spec
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

      // Filter by sequence (for non-history, where all sequences may be returned)
      if (spec.dataSource !== 'history') {
        points = points.filter((p) => {
          const entry = p as any;
          if (entry.isl != null && entry.osl != null) {
            return entry.isl === isl && entry.osl === osl;
          }
          return true;
        });
      }

      if (points.length === 0) {
        setError(
          `No data found for ${spec.model} (${spec.sequence}). Try a different model or configuration.`,
        );
        setIsLoading(false);
        return;
      }

      hwKeys = [...new Set(points.map((p) => p.hwKey ?? '').filter(Boolean))];
      const colorMap = generateHighContrastColors(hwKeys, 'dark');

      barData = spec.chartType === 'bar' ? buildBenchmarkBarData(points, spec, colorMap) : [];
      scatterData = spec.chartType === 'scatter' ? points : [];

      await generateSummary(provider, apiKey, spec, barData, colorMap, setResult, scatterData);
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

async function generateSummary(
  provider: AiProvider,
  apiKey: string,
  spec: AiChartSpec,
  barData: AiChartBarPoint[],
  colorMap: Record<string, string>,
  setResult: (r: AiChartResult) => void,
  scatterData: InferenceData[] = [],
) {
  let summary: string | null = null;
  try {
    const hwKeys = [
      ...new Set([...barData.map((b) => b.hwKey), ...scatterData.map((p) => p.hwKey ?? '')]),
    ].filter(Boolean);
    const dataDesc =
      barData.length > 0
        ? barData.map((b) => `${b.label}: ${b.value.toFixed(2)}`).join('\n')
        : `${scatterData.length} data points across ${hwKeys.length} hardware configs`;

    const summaryRaw = await callLlm(
      provider,
      apiKey,
      buildSummaryPrompt(spec, dataDesc),
      'Provide the summary.',
    );
    summary = summaryRaw.trim();
  } catch {
    // Summary generation is non-critical
  }

  setResult({
    spec,
    barData,
    scatterData,
    colorMap,
    summary,
  });
}
