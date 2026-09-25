'use client';

import { useState } from 'react';

import ChartLegend from '@/components/ui/chart-legend';
import { D3Chart, type D3ChartProps } from '@/lib/d3-chart/D3Chart';
import { escapeHtml } from '@/lib/utils';

import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';
import { ticksFor } from './scales';

/**
 * D3Chart with the OperatorX defaults: logo watermark, no zoom hint, and readable
 * ticks on log axes unless the axis sets its own.
 */
export function OpxChart<T>(props: D3ChartProps<T>) {
  const { xScale, yScale, xAxis, yAxis } = props;
  return (
    <D3Chart<T>
      watermark="logo"
      instructions=""
      grabCursor={false}
      transitionDuration={200}
      {...props}
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
}: {
  title: string;
  color?: string;
  rows: string[];
}): string {
  return `<div class="rounded-md border bg-background/95 px-3 py-2 text-xs shadow-md backdrop-blur-sm" style="min-width: 180px; max-width: 360px">
    <div class="font-semibold mb-1"${color ? ` style="color: ${color}"` : ''}>${escapeHtml(title)}</div>
    ${rows.map((r) => `<div>${r}</div>`).join('')}
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
