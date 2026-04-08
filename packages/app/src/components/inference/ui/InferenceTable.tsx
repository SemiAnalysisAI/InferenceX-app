'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { track } from '@/lib/analytics';
import type { ChartDefinition, InferenceData } from '@/components/inference/types';
import { getHardwareConfig } from '@/lib/constants';
import { getNestedYValue } from '@/lib/chart-utils';
import { getDisplayLabel } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface InferenceTableProps {
  data: InferenceData[];
  chartDefinition: ChartDefinition;
  selectedYAxisMetric: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500] as const;

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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(25);

  // Resolve Y-axis config from chart definition
  const yPath = chartDefinition[selectedYAxisMetric as keyof ChartDefinition] as string | undefined;
  const yLabel = chartDefinition[`${selectedYAxisMetric}_label` as keyof ChartDefinition] as string;
  const xLabel = chartDefinition.x_label;

  // Sort by Y value — direction depends on roofline orientation
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

  // Reset to first page when data or page size changes
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

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
            {pageData.map((point, i) => {
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

      {/* Pagination controls */}
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              const size = Number(v);
              setPageSize(size);
              setPage(0);
              track('inference_table_page_size_changed', { size });
            }}
          >
            <SelectTrigger className="h-6 w-auto gap-1 px-2 text-xs" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>per page</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setPage((p) => Math.max(0, p - 1));
              track('inference_table_page_changed', { direction: 'prev' });
            }}
            disabled={safePage === 0}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>
            {safePage + 1} / {totalPages}
          </span>
          <button
            onClick={() => {
              setPage((p) => Math.min(totalPages - 1, p + 1));
              track('inference_table_page_changed', { direction: 'next' });
            }}
            disabled={safePage >= totalPages - 1}
            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
