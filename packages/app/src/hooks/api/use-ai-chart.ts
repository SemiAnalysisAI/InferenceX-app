'use client';

import { useCallback, useState } from 'react';

import type { AiChartBarPoint, AiChartSpec, AiProvider } from '@/components/ai-chart/types';
import { buildParsePrompt, buildSummaryPrompt } from '@/components/ai-chart/prompt-templates';
import type { InferenceData } from '@/components/inference/types';
import { callLlm } from '@/lib/ai-providers';
import { fetchBenchmarks } from '@/lib/api';
import { transformBenchmarkRows } from '@/lib/benchmark-transform';
import { getNestedYValue } from '@/lib/chart-utils';
import { generateHighContrastColors } from '@/lib/chart-utils';
import { getHardwareConfig, getModelSortIndex } from '@/lib/constants';

import chartDefinitions from '@/components/inference/inference-chart-config.json';

interface AiChartResult {
  spec: AiChartSpec;
  /** For bar charts: aggregated bar data. */
  barData: AiChartBarPoint[];
  /** For scatter charts: raw InferenceData points. */
  scatterData: InferenceData[];
  /** Color map: hwKey → color. */
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

/**
 * For bar charts: group scatter data by hwKey, find the point closest to
 * targetInteractivity, and extract the requested metric value.
 */
function buildBarData(
  data: InferenceData[],
  spec: AiChartSpec,
  colorMap: Record<string, string>,
): AiChartBarPoint[] {
  const target = spec.targetInteractivity ?? 40;

  // Find the y-field path from the chart config (interactivity chart = index 0)
  const chartDef = (chartDefinitions as any[])[0];
  const yFieldPath: string = chartDef[spec.yAxisMetric] ?? 'tpPerGpu.y';

  // Group by hwKey
  const groups = new Map<string, InferenceData[]>();
  for (const point of data) {
    const key = point.hwKey ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(point);
  }

  const bars: AiChartBarPoint[] = [];
  for (const [hwKey, points] of groups) {
    // Find closest to target interactivity (x = median_intvty)
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

  // Sort by MODEL_ORDER (GPU hierarchy)
  bars.sort((a, b) => getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey));
  return bars;
}

function sequenceToIslOsl(seq: string): { isl: number; osl: number } {
  const parts = seq.split('/');
  const parse = (s: string) => (s.includes('8k') ? 8192 : 1024);
  return { isl: parse(parts[0] ?? '1k'), osl: parse(parts[1] ?? '1k') };
}

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

      // Step 2: Fetch benchmark data from our API
      const rows = await fetchBenchmarks(spec.model);

      // Step 3: Transform to InferenceData
      const { chartData } = transformBenchmarkRows(rows);
      // Use interactivity chart (index 0)
      let points = chartData[0] ?? [];

      // Step 4: Filter by spec
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

      // Filter by sequence
      const { isl, osl } = sequenceToIslOsl(spec.sequence);
      points = points.filter((p) => {
        const entry = p as any;
        // BenchmarkRows are keyed by model which includes sequence in the API,
        // but transformed points don't always have isl/osl. Check conc-level data
        // if we can, otherwise keep all (single-sequence model).
        if (entry.isl != null && entry.osl != null) {
          return entry.isl === isl && entry.osl === osl;
        }
        return true;
      });

      if (points.length === 0) {
        setError(
          `No data found for ${spec.model} (${spec.sequence}). Try a different model or configuration.`,
        );
        setIsLoading(false);
        return;
      }

      // Step 5: Build color map
      const hwKeys = [...new Set(points.map((p) => p.hwKey ?? '').filter(Boolean))];
      const colorMap = generateHighContrastColors(hwKeys, 'dark');

      // Step 6: Build chart-specific data
      const barData = spec.chartType === 'bar' ? buildBarData(points, spec, colorMap) : [];
      const scatterData = spec.chartType === 'scatter' ? points : [];

      // Step 7: Generate summary (best-effort, don't block on failure)
      let summary: string | null = null;
      try {
        const dataDesc =
          spec.chartType === 'bar'
            ? barData.map((b) => `${b.label}: ${b.value.toFixed(1)}`).join('\n')
            : `${points.length} data points across ${hwKeys.length} hardware configs`;

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
