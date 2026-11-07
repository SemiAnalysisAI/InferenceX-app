'use client';

import { useId, useState, type ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { ChartButtons, ExpandChartButton } from '@/components/ui/chart-buttons';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { D3Chart, type D3ChartProps } from '@/lib/d3-chart/D3Chart';
import { track } from '@/lib/analytics/analytics';
import { useDialogCloseTracking } from '@/lib/analytics/use-dialog-close-tracking';

interface D3ChartCardProps<T> {
  title: string;
  subtitle?: ReactNode;
  chart: Omit<D3ChartProps<T>, 'chartId'>;
  controls?: ReactNode;
  analyticsPrefix: string;
  filename?: string;
}

export function D3ChartCard<T>({
  title,
  subtitle,
  chart,
  controls,
  analyticsPrefix,
  filename,
}: D3ChartCardProps<T>) {
  const id = useId().replaceAll(/[^a-zA-Z0-9_-]/g, '');
  const [expanded, setExpanded] = useState(false);
  useDialogCloseTracking(expanded, `${analyticsPrefix}_chart_closed`, { title });
  const inlineId = `${analyticsPrefix}-${id}`;
  const expandedId = `${inlineId}-expanded`;
  const renderChart = (chartId: string, height?: number) => (
    <D3Chart
      {...chart}
      chartId={chartId}
      height={height ?? chart.height}
      instructions={chart.zoom?.enabled ? chart.instructions : ''}
      zoom={{ enabled: false, ...chart.zoom, resetEventName: `d3chart_zoom_reset_${chartId}` }}
    />
  );
  const exportFileName = filename?.replace(/\.png$/iu, '') ?? title;
  const actions = (chartId: string, canExpand: boolean) => (
    <ChartButtons
      chartId={chartId}
      analyticsPrefix={analyticsPrefix}
      analyticsChart={exportFileName}
      exportFileName={exportFileName}
      zoomResetEvent={`d3chart_zoom_reset_${chartId}`}
      hideZoomReset={!chart.zoom?.enabled}
      leadingControls={
        canExpand ? (
          <ExpandChartButton
            chartTitle={title}
            onClick={() => {
              track(`${analyticsPrefix}_chart_expanded`, { title });
              setExpanded(true);
            }}
          />
        ) : undefined
      }
    />
  );

  return (
    <Card className="gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {actions(inlineId, true)}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {controls}
      </div>
      <div className="min-w-0">{renderChart(inlineId)}</div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-6xl max-h-[90vh] overflow-auto">
          <DialogTitle className="pr-8">{title}</DialogTitle>
          <DialogDescription className={subtitle ? undefined : 'sr-only'}>
            {subtitle ?? title}
          </DialogDescription>
          {actions(expandedId, false)}
          {renderChart(expandedId, 480)}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
