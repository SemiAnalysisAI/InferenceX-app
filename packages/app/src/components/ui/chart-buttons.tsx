'use client';

import { track } from '@/lib/analytics';
import { Download, FileSpreadsheet, Image, RotateCcw, Video } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { useChartExport } from '@/hooks/useChartExport';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ChartButtonsProps {
  /** Unique chart ID for export targeting */
  chartId: string;
  /** Analytics event prefix (e.g., 'latency', 'interactivity', 'gpu_timeseries', 'reliability', 'evaluation') */
  analyticsPrefix: string;
  /** Optional custom zoom reset event name (defaults to `${analyticsPrefix}_zoom_reset_${chartId}`) */
  zoomResetEvent?: string;
  /** Optional setter to temporarily expand legend during export */
  setIsLegendExpanded?: (expanded: boolean) => void;
  /** Hide the zoom reset button (e.g., for charts without zoom) */
  hideZoomReset?: boolean;
  /** Hide the PNG image export button (e.g., for table views) */
  hideImageExport?: boolean;
  /** Optional callback to export chart data as CSV */
  onExportCsv?: () => void;
  /** Optional callback to open the MP4 export preview (e.g., replay modal) */
  onExportMp4?: () => void;
  /** Human-readable base name for exported files (e.g. "DeepSeek-R1_throughput_interactivity"). Falls back to chartId. */
  exportFileName?: string;
  /**
   * Optional controls rendered before export/reset buttons, such as a view toggle.
   * These inherit this wrapper's desktop-only (`hidden md:flex`) and no-export behavior.
   */
  leadingControls?: ReactNode;
  /** Optional container class override for positioning/layout variants. */
  className?: string;
}

/**
 * Reusable chart action buttons component that provides:
 * - Export to image button with analytics tracking (or dropdown with PNG/CSV when onExportCsv is provided)
 * - Reset zoom button with custom event dispatch
 *
 * Event pattern: `${analyticsPrefix}_zoom_reset_${chartId}`
 * This ensures each chart instance has its own zoom reset event.
 */
export function ChartButtons({
  chartId,
  analyticsPrefix,
  zoomResetEvent,
  setIsLegendExpanded,
  hideZoomReset,
  hideImageExport,
  onExportCsv,
  onExportMp4,
  exportFileName,
  leadingControls,
  className,
}: ChartButtonsProps) {
  const { isExporting, exportToImage } = useChartExport({
    chartId,
    setIsLegendExpanded,
    exportFileName,
  });
  const [popoverOpen, setPopoverOpen] = useState(false);
  // always include chartId in event name for consistency
  const resetEventName = zoomResetEvent || `${analyticsPrefix}_zoom_reset_${chartId}`;

  const handleExportPng = () => {
    setPopoverOpen(false);
    track(`${analyticsPrefix}_chart_exported`);
    exportToImage();
  };

  const handleExportCsv = () => {
    setPopoverOpen(false);
    track(`${analyticsPrefix}_csv_exported`);
    onExportCsv?.();
    window.dispatchEvent(new CustomEvent('inferencex:action'));
  };

  const handleExportMp4 = () => {
    setPopoverOpen(false);
    track(`${analyticsPrefix}_mp4_preview_opened`);
    onExportMp4?.();
  };

  return (
    <div
      className={cn(
        'hidden md:flex absolute top-6 right-6 md:top-8 md:right-8 no-export export-buttons gap-1 z-10',
        className,
      )}
    >
      {leadingControls}
      {onExportCsv || onExportMp4 ? (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              data-testid="export-button"
              variant="outline"
              size={isExporting ? 'default' : 'icon'}
              className={`h-7 shrink-0 ${isExporting ? '' : 'w-7'}`}
              disabled={isExporting}
            >
              <Download className={isExporting ? 'mr-2' : ''} size={16} />
              {isExporting && 'Exporting...'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button
              data-testid="export-png-button"
              data-ph-capture-attribute-export-type="png"
              data-ph-capture-attribute-chart={chartId}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer ${hideImageExport ? 'opacity-40 pointer-events-none' : ''}`}
              onClick={handleExportPng}
              aria-disabled={hideImageExport}
            >
              <Image size={14} />
              Download PNG
            </button>
            {onExportCsv && (
              <button
                data-testid="export-csv-button"
                data-ph-capture-attribute-export-type="csv"
                data-ph-capture-attribute-chart={chartId}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                onClick={handleExportCsv}
              >
                <FileSpreadsheet size={14} />
                Download CSV
              </button>
            )}
            {onExportMp4 && (
              <button
                data-testid="export-mp4-button"
                data-ph-capture-attribute-export-type="mp4"
                data-ph-capture-attribute-chart={chartId}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                onClick={handleExportMp4}
              >
                <Video size={14} />
                Download MP4
              </button>
            )}
          </PopoverContent>
        </Popover>
      ) : (
        <Button
          data-testid="export-button"
          variant="outline"
          size={isExporting ? 'default' : 'icon'}
          className={`h-7 shrink-0 ${isExporting ? '' : 'w-7'}`}
          onClick={handleExportPng}
          disabled={isExporting}
        >
          <Download className={isExporting ? 'mr-2' : ''} size={16} />
          {isExporting && 'Exporting...'}
        </Button>
      )}
      {!hideZoomReset && (
        <Button
          data-testid="zoom-reset-button"
          variant="outline"
          size="icon"
          className="size-7"
          disabled={hideImageExport}
          onClick={() => {
            track(`${analyticsPrefix}_zoom_reset_button`);
            window.dispatchEvent(new CustomEvent(resetEventName));
          }}
        >
          <RotateCcw size={16} />
        </Button>
      )}
    </div>
  );
}
