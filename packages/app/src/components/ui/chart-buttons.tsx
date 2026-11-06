'use client';

import { track } from '@/lib/analytics/analytics';
import type { SelectionAnalyticsContext } from '@/lib/analytics/selection-context';
import { Download, FileSpreadsheet, Image, Maximize2, RotateCcw, Video } from 'lucide-react';
import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useChartExport, type PngAspectRatio } from '@/hooks/useChartExport';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';

const MENU_ITEM_STYLE =
  'flex min-h-11 w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer md:min-h-8';

function useTitleSlot(enabled: boolean, placeRef: RefObject<HTMLElement | null>) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const toolbar = placeRef.current;
    const container = toolbar?.parentElement;
    if (!enabled || !toolbar || !container || getComputedStyle(toolbar).position === 'absolute') {
      return;
    }
    const host = document.createElement('div');
    host.className = 'no-export mt-2';
    let anchor: Element | null = null;
    const place = () => {
      const marker = placeRef.current;
      const heading = container.querySelector('h1, h2, h3, h4, h5, h6');
      anchor =
        marker &&
        heading &&
        marker.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING
          ? heading
          : null;
      while (
        anchor?.parentElement &&
        anchor.parentElement !== container &&
        anchor.parentElement.tagName !== 'FIGCAPTION'
      ) {
        anchor = anchor.parentElement;
      }
      if (!anchor) host.remove();
      else if (anchor.nextSibling !== host) anchor.after(host);
      setSlot(anchor ? host : null);
    };
    place();
    const observer = new MutationObserver(() => {
      if (!anchor?.isConnected || anchor.nextSibling !== host) place();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      host.remove();
      setSlot(null);
    };
  }, [enabled, placeRef]);
  return slot;
}

interface ChartButtonsProps {
  chartId: string;
  /** Prefix for the built-in export and zoom-reset events. Omit to fire none of them. */
  analyticsPrefix?: string;
  zoomResetEvent?: string;
  /** Called after a PNG export starts, so the caller can fire its own event. */
  onExportPng?: (aspectRatio: PngAspectRatio) => void;
  setIsLegendExpanded?: (expanded: boolean) => void;
  hideLegendOnExport?: boolean;
  hideZoomReset?: boolean;
  hideImageExport?: boolean;
  onExportCsv?: () => void;
  onExportMp4?: () => void;
  exportFileName?: string;
  leadingControls?: ReactNode;
  className?: string;
  mobileVisible?: boolean;
  /** The `chart` property of export and zoom-reset events. Defaults to `chartId`. */
  analyticsChart?: string;
  /** Dashboard state sent with every export, CSV, MP4 and zoom-reset event, next to `chart`. */
  analyticsContext?: SelectionAnalyticsContext;
}

export function ChartButtons({
  chartId,
  analyticsPrefix,
  zoomResetEvent,
  onExportPng,
  setIsLegendExpanded,
  hideLegendOnExport,
  hideZoomReset,
  hideImageExport,
  onExportCsv,
  onExportMp4,
  exportFileName,
  leadingControls,
  className,
  mobileVisible = true,
  analyticsChart = chartId,
  analyticsContext,
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
          aspectRatio: 'PNG 宽高比',
          auto: '自动',
        }
      : {
          exporting: 'Exporting...',
          exportMenu: 'Download chart',
          png: 'Download PNG',
          csv: 'Download CSV',
          mp4: 'Download MP4',
          reset: 'Reset zoom',
          aspectRatio: 'PNG aspect ratio',
          auto: 'Auto',
        };
  const { isExporting, exportToImage } = useChartExport({
    chartId,
    setIsLegendExpanded,
    hideLegend: hideLegendOnExport,
    exportFileName,
  });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pngAspectRatio, setPngAspectRatio] = useState<PngAspectRatio>('auto');
  const resetEventName = zoomResetEvent || `${analyticsPrefix ?? 'chart'}_zoom_reset_${chartId}`;
  const eventProperties = { chart: analyticsChart, ...analyticsContext };
  const trackEvent = (suffix: string, properties: Record<string, unknown> = eventProperties) => {
    if (analyticsPrefix) track(`${analyticsPrefix}_${suffix}`, properties);
  };

  const handleExportPng = () => {
    setPopoverOpen(false);
    trackEvent('chart_exported', { ...eventProperties, aspect_ratio: pngAspectRatio });
    exportToImage(pngAspectRatio);
    onExportPng?.(pngAspectRatio);
  };

  const handleExportCsv = () => {
    setPopoverOpen(false);
    trackEvent('csv_exported');
    onExportCsv?.();
    window.dispatchEvent(new CustomEvent('inferencex:action'));
  };

  const handleExportMp4 = () => {
    setPopoverOpen(false);
    trackEvent('mp4_preview_opened');
    onExportMp4?.();
  };

  const placeRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobileViewport();
  const slot = useTitleSlot(mobileVisible && isMobile, placeRef);

  const toolbar = (
    <div
      ref={slot ? undefined : placeRef}
      data-slot="chart-actions"
      className={cn(
        'no-export export-buttons min-w-0 flex-wrap items-center justify-start gap-2 md:justify-end',
        slot ? 'mb-2' : 'mb-3',
        mobileVisible ? 'flex' : 'hidden md:flex',
        className,
      )}
    >
      {leadingControls && (
        <div className="flex min-w-fit flex-1 flex-wrap items-center gap-2 md:flex-none">
          {leadingControls}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-2">
        <Popover
          open={popoverOpen}
          onOpenChange={(open) => {
            if (open) trackEvent('export_menu_opened');
            setPopoverOpen(open);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              data-testid="export-button"
              variant="outline"
              size={isExporting ? 'xs' : 'icon-xs'}
              disabled={isExporting}
              aria-label={t.exportMenu}
            >
              <Download />
              {isExporting && t.exporting}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            {!hideImageExport && (
              <label className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>{t.aspectRatio}</span>
                <select
                  data-testid="png-aspect-ratio"
                  aria-label={t.aspectRatio}
                  className="h-11 rounded-md border border-input bg-background px-2 text-sm md:h-8"
                  value={pngAspectRatio}
                  onChange={(event) => setPngAspectRatio(event.target.value as PngAspectRatio)}
                >
                  <option value="auto">{t.auto}</option>
                  <option value="16:9">16:9</option>
                  <option value="1:1">1:1</option>
                </select>
              </label>
            )}
            <button
              type="button"
              data-testid="export-png-button"
              data-ph-capture-attribute-export-type="png"
              data-ph-capture-attribute-chart={chartId}
              className={cn(MENU_ITEM_STYLE, hideImageExport && 'opacity-40 pointer-events-none')}
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
                className={MENU_ITEM_STYLE}
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
                className={MENU_ITEM_STYLE}
                onClick={handleExportMp4}
              >
                <Video size={14} />
                {t.mp4}
              </button>
            )}
          </PopoverContent>
        </Popover>
        {!hideZoomReset && (
          <Button
            data-testid="zoom-reset-button"
            variant="outline"
            size="icon-xs"
            disabled={hideImageExport}
            aria-label={t.reset}
            onClick={() => {
              trackEvent('zoom_reset_button');
              window.dispatchEvent(new CustomEvent(resetEventName));
            }}
          >
            <RotateCcw size={16} />
          </Button>
        )}
      </div>
    </div>
  );
  return slot ? (
    <>
      <div ref={placeRef} hidden />
      {createPortal(toolbar, slot)}
    </>
  ) : (
    toolbar
  );
}

/** Ghost icon button that opens a chart in a larger dialog. */
export function ExpandChartButton({
  onClick,
  label,
  chartTitle,
}: {
  onClick: () => void;
  /** Full accessible name. Defaults to "Expand chart", followed by `chartTitle` when given. */
  label?: string;
  chartTitle?: string;
}) {
  const base = useLocale() === 'zh' ? '展开图表' : 'Expand chart';
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label ?? (chartTitle ? `${base}: ${chartTitle}` : base)}
      onClick={onClick}
    >
      <Maximize2 className="size-4" />
    </Button>
  );
}
