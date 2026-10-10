'use client';

import { useId, useState, type ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { D3Chart, type D3ChartProps } from '@/lib/d3-chart/D3Chart';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

interface D3ChartCardProps<T> {
  title: string;
  subtitle?: ReactNode;
  chart: Omit<D3ChartProps<T>, 'chartId'>;
  controls?: ReactNode;
  analyticsPrefix: string;
  filename?: string;
}

/** Shared D3 rendering, export and expansion without a second SVG zoom implementation. */
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
  const locale = useLocale();
  const inlineId = `${analyticsPrefix}-${id}`;
  const expandedId = `${inlineId}-expanded`;
  const expandLabel = locale === 'zh' ? '展开图表' : 'Expand chart';
  const renderChart = (chartId: string, height?: number) => (
    <D3Chart
      {...chart}
      chartId={chartId}
      height={height ?? chart.height}
      instructions={chart.zoom?.enabled ? chart.instructions : ''}
      zoom={{ enabled: false, ...chart.zoom, resetEventName: `d3chart_zoom_reset_${chartId}` }}
    />
  );
  const actions = (chartId: string, canExpand: boolean) => (
    <ChartButtons
      chartId={chartId}
      analyticsPrefix={analyticsPrefix}
      exportFileName={filename?.replace(/\.png$/iu, '') ?? title}
      zoomResetEvent={`d3chart_zoom_reset_${chartId}`}
      hideZoomReset={!chart.zoom?.enabled}
      leadingControls={
        canExpand ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${expandLabel}: ${title}`}
            onClick={() => {
              track(`${analyticsPrefix}_chart_expanded`, { title });
              setExpanded(true);
            }}
          >
            <Maximize2 className="size-4" />
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <Card className="min-w-0 gap-3">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">{title}</CardTitle>
          {actions(inlineId, true)}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {controls}
      </CardHeader>
      <CardContent className="min-w-0 px-3">{renderChart(inlineId)}</CardContent>
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
