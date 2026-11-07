'use client';

import { useRef } from 'react';

import type { ChartLegendProps } from '@/components/ui/chart-legend';
import { D3Chart, type D3ChartHandle, type D3ChartProps } from '@/lib/d3-chart/D3Chart';

import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';
import { ticksFor } from './scales';

export function OpxChart<T>({
  inspect,
  ...props
}: D3ChartProps<T> & { inspect?: { model: ComparisonModel; caseOf: (d: T) => number } }) {
  const { xScale, yScale, xAxis, yAxis, tooltip } = props;
  const chart = useRef<D3ChartHandle>(null);
  // d3-axis sets font-family="sans-serif" on tick text; use the page font instead.
  return (
    <div className="[&_.tick_text]:font-sans">
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
        xAxis={{
          ...xAxis,
          tickValues: xAxis?.tickValues ?? (xScale && ticksFor(xScale).tickValues),
        }}
        yAxis={{
          ...yAxis,
          tickValues: yAxis?.tickValues ?? (yScale && ticksFor(yScale).tickValues),
        }}
      />
    </div>
  );
}

export function hardwareLegend(
  model: ComparisonModel,
  idScope: string,
  lineDasharray: string | undefined,
  keys = model.available,
): Pick<ChartLegendProps, 'legendItems' | 'onItemRemove' | 'reset'> {
  return {
    legendItems: keys.map((hw) => ({
      name: hw,
      hw,
      idScope,
      label: hardwareLabel(hw),
      color: model.colors[hw] ?? 'var(--muted-foreground)',
      lineDasharray,
      isActive: model.hardware.includes(hw),
      onClick: model.toggle,
    })),
    onItemRemove: model.toggle,
    reset: {
      id: 'operatorx-reset-filter',
      disabled: keys.every((hw) => model.hardware.includes(hw)),
      onClick: model.reset,
    },
  };
}
