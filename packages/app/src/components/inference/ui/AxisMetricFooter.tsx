'use client';

import { Info, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import {
  METRIC_EXPLANATIONS,
  metricRowLabel,
  X_AXIS_EXPLANATIONS,
  xAxisPercentileFromLabel,
  type XAxisKind,
} from '@/components/inference/axis-metric-explanations';
import type { MetricKey } from '@/components/inference/metric-registry';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

const STRINGS = {
  en: {
    xAxisPrefix: 'X-axis: ',
    yAxisPrefix: 'Y-axis: ',
    formula: 'Formula',
  },
  zh: {
    xAxisPrefix: 'X 轴：',
    yAxisPrefix: 'Y 轴：',
    formula: '计算公式',
  },
} as const;

interface AxisMetricFooterProps {
  /** Chart instance id (e.g. "chart-0") for testids and analytics context. */
  chartId: string;
  /** Selected y-axis metric registry key (without the `y_` prefix). */
  metricKey: MetricKey;
  /** Resolved logical x-axis metric for the chart's current state. */
  xAxisKind: XAxisKind;
  /**
   * The chart's resolved English x-axis label (percentile-adjusted), used
   * only to extract the percentile prefix for the row name.
   */
  xAxisLabel: string;
  /**
   * Chart-level notices (KV-offload halo key, agentic optimization note,
   * ATOM engine footnote) rendered as the info section's final block.
   */
  notices?: ReactNode;
}

interface FooterRow {
  axis: 'x' | 'y';
  /** Registry key for analytics (metric key or x-axis kind). */
  key: string;
  label: string;
  description: string;
  formula?: string;
}

/**
 * Expandable per-axis metric explainer rendered below each inference chart.
 * One row per axis: the x-axis row explains the plotted latency/interactivity
 * metric, the y-axis row explains the selected metric and shows its
 * structural formula. Explanations describe the metric itself, so they apply
 * equally to official runs and `?unofficialrun=` overlay points, which share
 * the chart's resolved axes. Marked `no-export` so PNG exports (which capture
 * the chart element) never include it.
 */
export default function AxisMetricFooter({
  chartId,
  metricKey,
  xAxisKind,
  xAxisLabel,
  notices,
}: AxisMetricFooterProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [expanded, setExpanded] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

  const xExplanation = X_AXIS_EXPLANATIONS[xAxisKind];
  const pctl = xAxisPercentileFromLabel(xAxisLabel);
  const yExplanation = METRIC_EXPLANATIONS[metricKey];

  const rows: FooterRow[] = [
    {
      axis: 'x',
      key: xAxisKind,
      label: `${t.xAxisPrefix}${xExplanation.name[locale](pctl)}`,
      description: xExplanation.description[locale],
    },
    {
      axis: 'y',
      key: metricKey,
      label: `${t.yAxisPrefix}${metricRowLabel(metricKey, locale)}`,
      description: yExplanation.description[locale],
      formula: yExplanation.formula[locale],
    },
  ];

  const toggleRow = (row: FooterRow) => {
    setExpanded((prev) => {
      const next = !prev[row.axis];
      track('axis_metric_footer_toggled', {
        chart: chartId,
        axis: row.axis,
        metric: row.key,
        expanded: next,
      });
      return { ...prev, [row.axis]: next };
    });
  };

  return (
    <div className="no-export mt-4" data-testid={`axis-metric-footer-${chartId}`}>
      {rows.map((row) => {
        const isOpen = expanded[row.axis];
        const bodyId = `${chartId}-axis-metric-${row.axis}`;
        return (
          <div key={row.axis} className="border-t border-border/60">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 py-2.5 text-left"
              aria-expanded={isOpen}
              aria-controls={bodyId}
              data-testid={`axis-metric-row-${row.axis}-${chartId}`}
              onClick={() => toggleRow(row)}
            >
              <Info aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm text-muted-foreground">{row.label}</span>
              <Plus
                aria-hidden="true"
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  isOpen && 'rotate-45',
                )}
              />
            </button>
            <div
              id={bodyId}
              hidden={!isOpen}
              className="pb-3 pl-[1.375rem]"
              data-testid={`axis-metric-body-${row.axis}-${chartId}`}
            >
              <p className="text-sm text-muted-foreground">{row.description}</p>
              {row.formula && (
                <p className="mt-2">
                  <span className="sr-only">{t.formula}: </span>
                  <code
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                    data-testid={`axis-metric-formula-${chartId}`}
                  >
                    {row.formula}
                  </code>
                </p>
              )}
            </div>
          </div>
        );
      })}
      {notices && (
        <div
          className="space-y-2 border-t border-border/60 py-2.5"
          data-testid={`axis-metric-notices-${chartId}`}
        >
          {notices}
        </div>
      )}
    </div>
  );
}
