import { getGpuSpecs, type TcoBasis } from '@/lib/catalog/constants';

import chartDefinitions, { isAllInMeasuredConfigKey } from '@/components/inference/metric-registry';
import { allInMeasuredTableData } from '@/components/inference/utils/inference-table-data';
import {
  resolveXAxisField,
  type FixedSequenceStatistic,
} from '@/components/inference/utils/resolveXAxisField';
import { remapInferencePoint } from '@/lib/charts/chart-utils';
import { expandPowerCompareSeries } from '@/components/inference/utils/power-compare';

import type {
  ChartDefinition,
  ClippedInferenceData,
  InferenceData,
  PowerCompare,
  YAxisMetricKey,
} from './types';
import type { XAxisMode } from './hooks/useChartData';

export function selectUnofficialOverlayForMode<T>(
  xAxisMode: string,
  chartType: 'e2e' | 'interactivity',
  overlays: { e2e: T | null; interactivity: T | null },
): T | null {
  if (xAxisMode === 'e2e-normalized-interactivity') return null;
  return overlays[chartType];
}

export interface ProcessedChartData {
  data: InferenceData[];
  clippedData: ClippedInferenceData[];
  tableData?: InferenceData[];
}

export const filterDataByCostLimit = (
  data: InferenceData[],
  chartDefinition: ChartDefinition,
  selectedYAxisMetric: string,
): InferenceData[] => {
  const isCostMetric = selectedYAxisMetric.includes('cost') && selectedYAxisMetric !== 'y_costUser';

  if (!isCostMetric || !chartDefinition.y_cost_limit) {
    return data;
  }

  const metricKey = selectedYAxisMetric.replace('y_', '');

  const costFieldMap: Record<string, (point: InferenceData) => number | undefined> = {
    costh: (point) => point.costh?.y,
    costr: (point) => point.costr?.y,
    costhOutput: (point) => point.costhOutput?.y,
    costrOutput: (point) => point.costrOutput?.y,
    costhi: (point) => point.costhi?.y,
    costri: (point) => point.costri?.y,
    costUser: (point) => point.costUser?.y,
  };

  const getCostValue = costFieldMap[metricKey];

  if (!getCostValue) {
    return data;
  }

  return data.filter((point) => {
    const costValue = getCostValue(point);
    if (costValue === undefined) {
      return true;
    }
    return costValue <= chartDefinition.y_cost_limit!;
  });
};

export function partitionChartDataByLimits(
  data: InferenceData[],
  chartDefinition: ChartDefinition,
  selectedYAxisMetric: string,
  options: { isTtftX: boolean; isAgentic: boolean },
): ProcessedChartData {
  const costLimitApplies =
    selectedYAxisMetric.includes('cost') &&
    selectedYAxisMetric !== 'y_costUser' &&
    chartDefinition.y_cost_limit !== undefined;
  const latencyLimitApplies =
    options.isTtftX && !options.isAgentic && chartDefinition.y_latency_limit !== undefined;

  const visible: InferenceData[] = [];
  const clippedData: ClippedInferenceData[] = [];

  for (const point of data) {
    if (!Number.isFinite(point.x)) continue;
    const reasons: ClippedInferenceData['reasons'] = [];
    if (costLimitApplies && point.y > chartDefinition.y_cost_limit!) reasons.push('cost');
    if (latencyLimitApplies && point.x > chartDefinition.y_latency_limit!) {
      reasons.push('latency');
    }

    if (reasons.length > 0) clippedData.push({ point, reasons });
    else visible.push(point);
  }

  return { data: visible, clippedData };
}

export function processOverlayChartData(
  data: InferenceData[],
  chartType: 'e2e' | 'interactivity',
  selectedYAxisMetric: string,
  selectedXAxisMetric: string | null,
  options?: {
    isAgentic?: boolean;
    selectedPercentile?: string;
    selectedXAxisMode?: XAxisMode;
    fixedSequenceStatistic?: FixedSequenceStatistic;
    restrictToNormalizedFrontier?: boolean;
    tcoBasis?: TcoBasis;
    powerCompare?: PowerCompare;
  },
): InferenceData[] {
  return processOverlayChartDataWithClipping(
    data,
    chartType,
    selectedYAxisMetric,
    selectedXAxisMetric,
    options,
  ).data;
}

export function processOverlayChartDataWithClipping(
  data: InferenceData[],
  chartType: 'e2e' | 'interactivity',
  selectedYAxisMetric: string,
  selectedXAxisMetric: string | null,
  options?: {
    isAgentic?: boolean;
    selectedPercentile?: string;
    selectedXAxisMode?: XAxisMode;
    fixedSequenceStatistic?: FixedSequenceStatistic;
    restrictToNormalizedFrontier?: boolean;
    tcoBasis?: TcoBasis;
    powerCompare?: PowerCompare;
  },
): ProcessedChartData {
  const chartDef = (chartDefinitions as ChartDefinition[]).find((d) => d.chartType === chartType);
  if (!chartDef) return { data: [], clippedData: [] };

  const metricKey = selectedYAxisMetric.replace('y_', '') as YAxisMetricKey;
  const isAgentic = options?.isAgentic === true;
  const selectedPercentile = options?.selectedPercentile ?? 'median';
  const sourceData =
    options?.tcoBasis === 'internal'
      ? data.map((point) => {
          const external = getGpuSpecs(point.hwKey, 'external');
          const internal = getGpuSpecs(point.hwKey, 'internal');
          const repriced = { ...point };
          for (const [provider, suffix] of [
            ['costh', 'H'],
            ['costr', 'R'],
          ] as const) {
            if (external[provider] <= 0 || internal[provider] <= 0) continue;
            const ratio = internal[provider] / external[provider];
            const costs = [provider, `${provider}i`, `${provider}Output`] as const;
            const purchasingPower = [
              `tokensPerDollar${suffix}`,
              `inputTokensPerDollar${suffix}`,
              `outputTokensPerDollar${suffix}`,
            ] as const;
            for (const key of [...costs, ...purchasingPower]) {
              const value = point[key];
              if (value)
                repriced[key] = {
                  ...value,
                  y: value.y * (key.startsWith('cost') ? ratio : 1 / ratio),
                };
            }
          }
          return repriced;
        })
      : data;

  const { xAxisField } = resolveXAxisField(chartDef, selectedYAxisMetric, selectedXAxisMetric, {
    isAgentic,
    percentile: selectedPercentile,
    xAxisMode: options?.selectedXAxisMode,
    fixedSequenceStatistic: options?.fixedSequenceStatistic,
  });

  const isTtftX = xAxisField.endsWith('_ttft');

  const processedData = expandPowerCompareSeries(
    sourceData
      .filter((d) => metricKey in d)
      .map((d) => remapInferencePoint(d, metricKey, xAxisField)),
    selectedYAxisMetric,
    options?.powerCompare ?? 'none',
  );

  const rooflineKey = `${selectedYAxisMetric}_roofline` as keyof ChartDefinition;
  if (options?.restrictToNormalizedFrontier && chartDef[rooflineKey]) {
    for (const point of processedData) {
      point.isOnNormalizedInteractivityFrontier = false;
    }
  }

  const partition = partitionChartDataByLimits(
    processedData,
    { ...chartDef, x_scale_field: xAxisField },
    selectedYAxisMetric,
    {
      isTtftX,
      isAgentic,
    },
  );
  return {
    ...partition,
    ...(isAllInMeasuredConfigKey(selectedYAxisMetric)
      ? {
          tableData: expandPowerCompareSeries(
            allInMeasuredTableData(sourceData, metricKey, xAxisField),
            selectedYAxisMetric,
            options?.powerCompare ?? 'none',
          ),
        }
      : {}),
  };
}
