import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';

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
}: ChartSectionProps) {
  return (
    <section className={className}>
      <figure className="relative min-w-0 rounded-xl">
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
        />

        <Card>{children}</Card>
      </figure>
    </section>
  );
}
