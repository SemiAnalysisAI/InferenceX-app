import type { GPUDataPoint, InterpolatedResult } from '@/components/calculator/types';
import { CompareInterpolatedTable } from '@/components/compare/compare-interpolated-table';

export interface CompareTableData {
  defaultTargets: number[];
  ssrRows: { target: number; a: InterpolatedResult | null; b: InterpolatedResult | null }[];
  interactivityRange: { min: number; max: number };
}

interface CompareTableRendererProps {
  aLabel: string;
  bLabel: string;
  ssrTableData: CompareTableData;
  interactivityRange: { min: number; max: number };
  gpuDataPointsA: GPUDataPoint[];
  gpuDataPointsB: GPUDataPoint[];
  emptyStateText: string;
  visibleMetricLabels?: string[];
  metricLabelOverrides?: Record<string, string>;
}

/** Pure empty/data renderer shared by every compare-page client. */
export function CompareTableRenderer({
  aLabel,
  bLabel,
  ssrTableData,
  interactivityRange,
  gpuDataPointsA,
  gpuDataPointsB,
  emptyStateText,
  visibleMetricLabels,
  metricLabelOverrides,
}: CompareTableRendererProps) {
  if (ssrTableData.defaultTargets.length === 0) {
    return (
      <div className="border border-border/50 rounded-md px-4 py-3 text-sm text-muted-foreground bg-muted/30">
        {emptyStateText}
      </div>
    );
  }

  return (
    <CompareInterpolatedTable
      aLabel={aLabel}
      bLabel={bLabel}
      ssrRows={ssrTableData.ssrRows}
      defaultTargets={ssrTableData.defaultTargets}
      interactivityRange={interactivityRange}
      gpuDataPointsA={gpuDataPointsA}
      gpuDataPointsB={gpuDataPointsB}
      visibleMetricLabels={visibleMetricLabels}
      metricLabelOverrides={metricLabelOverrides}
    />
  );
}
