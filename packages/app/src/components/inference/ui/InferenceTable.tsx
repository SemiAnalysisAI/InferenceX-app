'use client';

import { useMemo } from 'react';

import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { getHardwareConfig } from '@/lib/constants';
import { getNestedYValue } from '@/lib/chart-utils';
import { getDisplayLabel } from '@/lib/utils';

interface InferenceTableProps {
  data: InferenceData[];
  chartDefinition: ChartDefinition;
  selectedYAxisMetric: string;
}

/** Format a number for table display — picks sensible precision based on magnitude. */
function fmt(value: number, decimals?: number): string {
  if (decimals !== undefined) return value.toFixed(decimals);
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(1);
  if (Math.abs(value) >= 0.01) return value.toFixed(3);
  return value.toFixed(4);
}

export default function InferenceTable({
  data,
  chartDefinition,
  selectedYAxisMetric,
}: InferenceTableProps) {
  // Resolve Y-axis config from chart definition
  const yPath = chartDefinition[selectedYAxisMetric as keyof ChartDefinition] as string | undefined;
  const yLabel = chartDefinition[`${selectedYAxisMetric}_label` as keyof ChartDefinition] as string;
  const xLabel = chartDefinition.x_label;

  // Sort by Y value descending (higher = better for throughput metrics)
  const rooflineDir = chartDefinition[
    `${selectedYAxisMetric}_roofline` as keyof ChartDefinition
  ] as string | undefined;
  const yAscending = rooflineDir?.startsWith('lower');

  const sorted = useMemo(() => {
    if (!yPath) return data;
    return [...data].toSorted((a, b) => {
      const ay = getNestedYValue(a, yPath);
      const by = getNestedYValue(b, yPath);
      return yAscending ? ay - by : by - ay;
    });
  }, [data, yPath, yAscending]);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No data available for the current filters.
      </p>
    );
  }

  return (
    <div data-testid="inference-results-table">
      <div className="overflow-x-auto relative">
        {/* Watermark */}
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          aria-hidden="true"
        >
          <img src="/brand/logo-color.webp" alt="" className="w-48 opacity-10" />
        </div>
        <table className="w-full text-sm relative">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">GPU</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Precision</th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">TP</th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">Conc</th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">{yLabel}</th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">{xLabel}</th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                Throughput/GPU (tok/s)
              </th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                Median TTFT (ms)
              </th>
              <th className="text-right py-2 px-3 font-medium text-muted-foreground">
                Median Interactivity (tok/s)
              </th>
              <th
                className="text-center py-2 px-3 font-medium text-muted-foreground"
                title="Pareto optimal"
              >
                ★
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((point, i) => {
              const config = getHardwareConfig(point.hwKey);
              const gpuLabel = getDisplayLabel(config);
              const yValue = yPath ? getNestedYValue(point, yPath) : point.y;
              const isRoofline = yPath
                ? (() => {
                    const parts = yPath.split('.');
                    const obj = point[parts[0] as keyof InferenceData];
                    return typeof obj === 'object' && obj !== null && 'roof' in obj && obj.roof;
                  })()
                : false;

              return (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-3 font-medium whitespace-nowrap">{gpuLabel}</td>
                  <td className="py-2 px-3 whitespace-nowrap">{point.precision?.toUpperCase()}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{point.tp}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{point.conc}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{fmt(yValue)}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{fmt(point.x)}</td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {fmt(point.tput_per_gpu ?? 0, 1)}
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {fmt((point.median_ttft ?? 0) * 1000, 0)}
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {fmt(point.median_intvty ?? 0, 1)}
                  </td>
                  <td className="text-center py-2 px-3">{isRoofline ? '★' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
