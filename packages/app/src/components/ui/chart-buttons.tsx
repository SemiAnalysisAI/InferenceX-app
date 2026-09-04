'use client';

import { track } from '@/lib/analytics';
import { Download, FileSpreadsheet, Image, RotateCcw, Video } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { useChartExport } from '@/hooks/useChartExport';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/use-locale';

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
   * They wrap with the actions and inherit this wrapper's no-export behavior.
   */
  leadingControls?: ReactNode;
  /** Optional container class override for positioning/layout variants. */
  className?: string;
  /**
   * Actions are visible at every width by default. An explicit opt-out remains for
   * callers that supply an equivalent narrow-screen action surface elsewhere.
   * The toolbar stays in normal flow so long captions are never covered.
   */
  mobileVisible?: boolean;
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
  mobileVisible = true,
}: ChartButtonsProps) {
  const locale = useLocale();
  const t =
    locale === 'zh'
      ? {
          exporting: '正在导出……',
          exportMenu: '下载图表',
          png: '下载 PNG',
          csv: '下载 CSV',
          mp4: '下载 MP4',
          reset: '重置缩放',
        }
      : {
          exporting: 'Exporting...',
          exportMenu: 'Download chart',
          png: 'Download PNG',
          csv: 'Download CSV',
          mp4: 'Download MP4',
          reset: 'Reset zoom',
        };
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
      data-slot="chart-actions"
      className={cn(
        'no-export export-buttons mb-3 min-w-0 flex-wrap items-center justify-end gap-2',
        mobileVisible ? 'flex' : 'hidden md:flex',
        className,
      )}
    >
      {leadingControls && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">{leadingControls}</div>
      )}
      {onExportCsv || onExportMp4 ? (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              data-testid="export-button"
              variant="outline"
              size={isExporting ? 'default' : 'icon'}
              className={`h-11 shrink-0 md:h-8 ${isExporting ? '' : 'w-11 md:w-8'}`}
              disabled={isExporting}
              aria-label={t.exportMenu}
            >
              <Download className={isExporting ? 'mr-2' : ''} size={16} />
              {isExporting && t.exporting}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button
              type="button"
              data-testid="export-png-button"
              data-ph-capture-attribute-export-type="png"
              data-ph-capture-attribute-chart={chartId}
              className={`flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer md:min-h-8 ${hideImageExport ? 'opacity-40 pointer-events-none' : ''}`}
              onClick={handleExportPng}
              aria-disabled={hideImageExport}
            >
              <Image size={14} />
              {t.png}
            </button>
            {onExportCsv && (
              <button
                type="button"
                data-testid="export-csv-button"
                data-ph-capture-attribute-export-type="csv"
                data-ph-capture-attribute-chart={chartId}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer md:min-h-8"
                onClick={handleExportCsv}
              >
                <FileSpreadsheet size={14} />
                {t.csv}
              </button>
            )}
            {onExportMp4 && (
              <button
                type="button"
                data-testid="export-mp4-button"
                data-ph-capture-attribute-export-type="mp4"
                data-ph-capture-attribute-chart={chartId}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer md:min-h-8"
                onClick={handleExportMp4}
              >
                <Video size={14} />
                {t.mp4}
              </button>
            )}
          </PopoverContent>
        </Popover>
      ) : (
        <Button
          data-testid="export-button"
          variant="outline"
          size={isExporting ? 'default' : 'icon'}
          className={`h-11 shrink-0 md:h-8 ${isExporting ? '' : 'w-11 md:w-8'}`}
          onClick={handleExportPng}
          disabled={isExporting}
          aria-label={t.exportMenu}
        >
          <Download className={isExporting ? 'mr-2' : ''} size={16} />
          {isExporting && t.exporting}
        </Button>
      )}
      {!hideZoomReset && (
        <Button
          data-testid="zoom-reset-button"
          variant="outline"
          size="icon"
          className="size-11 md:size-8"
          disabled={hideImageExport}
          aria-label={t.reset}
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
