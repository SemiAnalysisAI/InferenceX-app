'use client';

import { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { ChartButtons } from '@/components/ui/chart-buttons';

interface ChartSectionProps {
  /** Unique chart ID for export and event targeting */
  chartId: string;
  /** Analytics event prefix (e.g., 'reliability', 'evaluation', 'latency') */
  analyticsPrefix: string;
  /** Chart content */
  children: ReactNode;
  /** Optional custom zoom reset event name (defaults to `${analyticsPrefix}_zoom_reset_${chartId}`) */
  zoomResetEvent?: string;
  /** Optional className for the section */
  className?: string;
  /** Optional setter to temporarily expand legend during export */
  setIsLegendExpanded?: (expanded: boolean) => void;
  /** Optional callback to export chart data as CSV */
  onExportCsv?: () => void;
  /** Human-readable base name for exported files. Falls back to chartId. */
  exportFileName?: string;
}

/**
 * Shared chart section component that provides:
 * - Export to image button with analytics tracking
 * - Reset zoom button with custom event dispatch
 * - Consistent card layout and styling
 * - Chart export functionality
 */
export function ChartSection({
  chartId,
  analyticsPrefix,
  children,
  zoomResetEvent,
  className = 'pt-8 md:pt-0',
  setIsLegendExpanded,
  onExportCsv,
  exportFileName,
}: ChartSectionProps) {
  return (
    <section className={className}>
      <figure className="relative rounded-lg">
        {/* Export and Reset Zoom Buttons */}
        <ChartButtons
          chartId={chartId}
          analyticsPrefix={analyticsPrefix}
          zoomResetEvent={zoomResetEvent}
          setIsLegendExpanded={setIsLegendExpanded}
          onExportCsv={onExportCsv}
          exportFileName={exportFileName}
        />

        <Card>{children}</Card>
      </figure>
    </section>
  );
}
