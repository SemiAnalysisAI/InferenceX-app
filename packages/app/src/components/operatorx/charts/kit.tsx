'use client';

import { useRef, useState } from 'react';

import ChartLegend from '@/components/ui/chart-legend';
import { D3Chart, type D3ChartHandle, type D3ChartProps } from '@/lib/d3-chart/D3Chart';
import { escapeHtml } from '@/lib/utils';

import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';
import { ticksFor } from './scales';

/**
 * D3Chart with the OperatorX defaults: logo watermark, no zoom hint, and readable
 * ticks on log axes unless the axis sets its own. With `inspect`, clicking a point
 * opens that case's drill-down instead of pinning the tooltip.
 */
export function OpxChart<T>({
  inspect,
  ...props
}: D3ChartProps<T> & { inspect?: { model: ComparisonModel; caseOf: (d: T) => number } }) {
  const { xScale, yScale, xAxis, yAxis, tooltip } = props;
  const chart = useRef<D3ChartHandle>(null);
  return (
    <D3Chart<T>
      ref={chart}
      watermark="logo"
      instructions=""
      grabCursor={false}
      transitionDuration={200}
      {...props}
      tooltip={
        tooltip && inspect
          ? {
              ...tooltip,
              onHoverStart: (sel, d) => {
                sel.attr('opacity', 0.8);
                inspect.model.preview(inspect.caseOf(d));
              },
              onHoverEnd: (sel) => sel.attr('opacity', 1),
              onPointClick: (d) => {
                chart.current?.dismissTooltip(true);
                inspect.model.inspect(inspect.caseOf(d));
              },
            }
          : tooltip
      }
      xAxis={{ ...xAxis, tickValues: xAxis?.tickValues ?? (xScale && ticksFor(xScale).tickValues) }}
      yAxis={{ ...yAxis, tickValues: yAxis?.tickValues ?? (yScale && ticksFor(yScale).tickValues) }}
    />
  );
}

/** Tooltip markup in the site's chart tooltip style. */
export function tooltipHtml({
  title,
  color,
  rows,
  footer,
}: {
  title: string;
  color?: string;
  rows: string[];
  /** Muted closing line, e.g. what a click does. */
  footer?: string;
}): string {
  return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 180px; max-width: 360px">
    <div class="font-semibold mb-1"${color ? ` style="color: ${color}"` : ''}>${escapeHtml(title)}</div>
    ${rows.map((r) => `<div>${r}</div>`).join('')}
    ${footer ? `<div class="mt-1 text-muted-foreground">${escapeHtml(footer)}</div>` : ''}
  </div>`;
}

export const esc = escapeHtml;

/**
 * Sidebar legend of the workload's GPUs; clicking one selects or deselects it for
 * the whole dashboard.
 */
export function HardwareLegend({
  model,
  hardware,
}: {
  model: ComparisonModel;
  hardware?: string[];
}) {
  const [expanded, setExpanded] = useState(true);
  const keys = hardware ?? model.available;
  return (
    <ChartLegend
      variant="sidebar"
      readOnly
      disableActiveSort
      isLegendExpanded={expanded}
      onExpandedChange={setExpanded}
      legendItems={keys.map((hw) => ({
        name: hw,
        hw,
        label: hardwareLabel(hw),
        color: model.colors[hw] ?? 'var(--muted-foreground)',
        isActive: model.hardware.includes(hw),
        onClick: () => model.toggle(hw),
      }))}
    />
  );
}
