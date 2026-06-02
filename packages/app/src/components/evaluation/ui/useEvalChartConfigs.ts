'use client';

import { useMemo } from 'react';

import { getModelSortIndex } from '@/lib/constants';
import { computeLeftMargin } from '@/lib/d3-chart/dynamic-margins';
import type { EvaluationChartData } from '@/components/evaluation/types';

const BASE_MARGIN = { top: 24, right: 24, bottom: 52 };

export interface EvalConfig {
  hwKey: string;
  configLabel: string;
}

function deriveConfigs(data: EvaluationChartData[], tieBreakOnLabel: boolean): EvalConfig[] {
  const configMap = new Map<string, EvalConfig>();
  data.forEach((d) => {
    if (!configMap.has(d.configLabel)) {
      configMap.set(d.configLabel, { hwKey: String(d.hwKey), configLabel: d.configLabel });
    }
  });
  return [...configMap.values()].toSorted(
    (a, b) =>
      getModelSortIndex(a.hwKey) - getModelSortIndex(b.hwKey) ||
      a.hwKey.localeCompare(b.hwKey) ||
      (tieBreakOnLabel ? a.configLabel.localeCompare(b.configLabel) : 0),
  );
}

export interface UseEvalChartConfigsArgs {
  chartData: EvaluationChartData[];
  unofficialChartData: EvaluationChartData[];
  unfilteredChartData: EvaluationChartData[];
  effectiveOfficialHardware: Set<string>;
  activeOverlayHwTypes: Set<string>;
}

export interface EvalChartConfigs {
  configurations: EvalConfig[];
  unofficialConfigurations: EvalConfig[];
  yLabels: string[];
  chartMargin: { top: number; right: number; bottom: number; left: number };
  sortedConfigLabels: string[];
  activeHwKeys: string[];
  activeConfigLabels: string[];
  configLabelToHwKey: Map<string, string>;
}

/**
 * Derives the config/label/margin data the evaluation bar chart needs from its
 * official + unofficial datasets. Pure memoized transforms extracted from
 * EvalBarChartD3 so the component body stays focused on rendering.
 */
export function useEvalChartConfigs({
  chartData,
  unofficialChartData,
  unfilteredChartData,
  effectiveOfficialHardware,
  activeOverlayHwTypes,
}: UseEvalChartConfigsArgs): EvalChartConfigs {
  const configurations = useMemo(
    () => deriveConfigs(unfilteredChartData, false),
    [unfilteredChartData],
  );

  const unofficialConfigurations = useMemo(
    () => deriveConfigs(unofficialChartData, true),
    [unofficialChartData],
  );

  const yLabels = useMemo(() => {
    const labels = new Set<string>();
    [...chartData, ...unofficialChartData].forEach((item) => labels.add(item.configLabel));
    return [...labels];
  }, [chartData, unofficialChartData]);

  const chartMargin = useMemo(
    () => ({
      ...BASE_MARGIN,
      left: computeLeftMargin(yLabels, {
        split: 'newline',
        primaryFont: '600 10px sans-serif',
        secondaryFont: '9px sans-serif',
        minMargin: 80,
      }),
    }),
    [yLabels],
  );

  const sortedConfigLabels = useMemo(
    () => [...configurations, ...unofficialConfigurations].map((c) => c.configLabel),
    [configurations, unofficialConfigurations],
  );

  const activeHwKeys = useMemo(
    () => [
      ...configurations.flatMap((c) => (effectiveOfficialHardware.has(c.hwKey) ? [c.hwKey] : [])),
      ...unofficialConfigurations.flatMap((c) =>
        activeOverlayHwTypes.has(c.hwKey) ? [c.hwKey] : [],
      ),
    ],
    [configurations, unofficialConfigurations, effectiveOfficialHardware, activeOverlayHwTypes],
  );

  const activeConfigLabels = useMemo(
    () => [
      ...configurations.flatMap((c) =>
        effectiveOfficialHardware.has(c.hwKey) ? [c.configLabel] : [],
      ),
      ...unofficialConfigurations.flatMap((c) =>
        activeOverlayHwTypes.has(c.hwKey) ? [c.configLabel] : [],
      ),
    ],
    [configurations, unofficialConfigurations, effectiveOfficialHardware, activeOverlayHwTypes],
  );

  const configLabelToHwKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of configurations) map.set(c.configLabel, c.hwKey);
    for (const c of unofficialConfigurations) map.set(c.configLabel, c.hwKey);
    return map;
  }, [configurations, unofficialConfigurations]);

  return {
    configurations,
    unofficialConfigurations,
    yLabels,
    chartMargin,
    sortedConfigLabels,
    activeHwKeys,
    activeConfigLabels,
    configLabelToHwKey,
  };
}
