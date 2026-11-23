'use client';

import type { ReactNode, RefObject } from 'react';

import type { ChartLegendProps } from '@/components/ui/chart-legend';
import { Heading, HeadingQualifier } from '@/components/ui/heading';
import { InfoHelp } from '@/components/ui/option-info';
import { ResultContext } from '@/components/ui/result-context';
import type { D3ChartHandle, TooltipConfig } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/i18n/use-locale';

import { hardwareLabel } from '../compare/hardware';
import type { ComparisonModel } from '../compare/model';

/** The inference scatter and GPU charts' plot margins. */
export const SCATTER_MARGIN = { top: 24, right: 10, bottom: 60, left: 72 };

/**
 * A chart's caption, as on the inference charts: the title with an optional one-line
 * qualifier and `?` methodology, then the chart's own controls, which PNG exports leave out.
 */
export function VizCaption({
  title,
  qualifier,
  info,
  children,
}: {
  title: string;
  qualifier?: string;
  info?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 md:pr-24">
      <div className="flex items-start gap-1">
        <Heading as="h2" level="card">
          {title}
          {qualifier && <HeadingQualifier>{qualifier}</HeadingQualifier>}
        </Heading>
        {info && (
          <InfoHelp label={title} value={title}>
            {info}
          </InfoHelp>
        )}
      </div>
      {children && (
        <div className="no-export flex flex-wrap items-center gap-x-5 gap-y-2 *:min-w-0">
          {children}
        </div>
      )}
    </div>
  );
}

/** The inference charts' source footer. */
export function VizFooter() {
  return (
    <div className="mt-3">
      <ResultContext locale={useLocale()} layout="footer" source="SemiAnalysis InferenceX™" />
    </div>
  );
}

/** Hovering a case prefetches its kernel timelines; clicking opens them. */
export function inspectCase<T>(
  model: ComparisonModel,
  caseOf: (d: T) => number,
  chart: RefObject<D3ChartHandle | null>,
): Pick<TooltipConfig<T>, 'onHoverStart' | 'onPointClick'> {
  return {
    onHoverStart: (_, d) => model.preview(caseOf(d)),
    onPointClick: (d) => {
      chart.current?.dismissTooltip(true);
      model.inspect(caseOf(d));
    },
  };
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
    onItemRemove: model.remove,
    reset: {
      id: 'operatorx-reset-filter',
      disabled: keys.every((hw) => model.hardware.includes(hw)),
      onClick: model.reset,
    },
  };
}
