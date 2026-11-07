import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';
import type { SelectionAnalyticsContext } from '@/lib/analytics/selection-context';

interface ChartSectionProps {
  chartId: string;
  analyticsPrefix: string;
  children: ReactNode;
  zoomResetEvent?: string;
  className?: string;
  setIsLegendExpanded?: (expanded: boolean) => void;
  onExportCsv?: () => void;
  exportFileName?: string;
  leadingControls?: ReactNode;
  hideImageExport?: boolean;
  mobileActions?: boolean;
  analyticsContext?: SelectionAnalyticsContext;
}

export function ChartSection({
  chartId,
  analyticsPrefix,
  children,
  zoomResetEvent,
  className,
  setIsLegendExpanded,
  onExportCsv,
  exportFileName,
  leadingControls,
  hideImageExport,
  mobileActions,
  analyticsContext,
}: ChartSectionProps) {
  return (
    <section className={className}>
      <figure className="relative min-w-0">
        <Card className="relative">
          <ChartButtons
            chartId={chartId}
            analyticsPrefix={analyticsPrefix}
            zoomResetEvent={zoomResetEvent}
            setIsLegendExpanded={setIsLegendExpanded}
            onExportCsv={onExportCsv}
            exportFileName={exportFileName}
            leadingControls={leadingControls}
            hideImageExport={hideImageExport}
            mobileVisible={mobileActions}
            analyticsContext={analyticsContext}
            className="md:absolute md:right-6 md:top-6 md:z-10 md:mb-0"
          />
          {children}
        </Card>
      </figure>
    </section>
  );
}
