'use client';

import {
  ChevronDown,
  ChevronRight,
  Circle,
  Diamond,
  Info,
  PanelRight,
  Square,
  Triangle,
  X,
} from 'lucide-react';
import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { SHAPE_ORDER, type ShapeKey, getShapeKeyForPrecision } from '@/lib/chart-rendering';
import { type Precision, getPrecisionLabel } from '@/lib/data-mappings';
import { filterAndSortLegendItems } from '@/lib/legend-utils';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

const SHAPE_ICON: Record<ShapeKey, React.ComponentType<{ size?: number; className?: string }>> = {
  circle: Circle,
  square: Square,
  triangle: Triangle,
  diamond: Diamond,
};

import { ATOM_FOOTNOTE_MARKER, AtomEngineFootnote } from './atom-engine-footnote';
import ChartLegendItem, { type CommonLegendItemProps } from './chart-legend-item';
import { Label } from './label';
import { Switch } from './switch';
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from './tooltip';

export type { CommonLegendItemProps } from './chart-legend-item';

const STRINGS = {
  en: {
    advanced: 'Advanced',
    moreInfo: (label: string) => `More info about ${label}`,
    hideLegend: 'Hide legend',
    showLegend: 'Show legend',
    hide: (label: string) => `Hide ${label}`,
    showPoints: (label: string) => `Show all ${label} data points`,
  },
  zh: {
    advanced: '高级',
    moreInfo: (label: string) => `查看${label}的更多信息`,
    hideLegend: '隐藏图例',
    showLegend: '显示图例',
    hide: (label: string) => `隐藏${label}`,
    showPoints: (label: string) => `显示${label}的全部数据点`,
  },
} as const;

export interface LegendSwitchConfig {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Optional explainer rendered as an info-icon tooltip next to the label. */
  infoTooltip?: React.ReactNode;
  advanced?: boolean;
}

export interface LegendActionConfig {
  id: string;
  label: string;
  onClick: () => void;
}

export interface ChartLegendProps {
  legendItems: CommonLegendItemProps[];
  isLegendExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  switches?: LegendSwitchConfig[];
  actions?: LegendActionConfig[];
  grouped?: boolean;
  /**
   * Selected precisions, in selection order. When 2+ are provided, the legend
   * renders a shape key: first precision → circle, second → square, third →
   * triangle, fourth → diamond. Only the selected precisions are listed.
   * A single precision (or none) hides the shape key entirely.
   */
  precisionIndicators?: readonly string[];
  /** Optional extra key/legend explanation rendered alongside the FP indicators. */
  keyIndicators?: React.ReactNode;
  enableTooltips?: boolean;
  maxHeight?: number;
  /** Override styles on the outer legend container (e.g. maxHeight to constrain scrollable area) */
  containerStyle?: React.CSSProperties;
  variant?: 'overlay' | 'sidebar';
  disableActiveSort?: boolean;
  onItemHover?: (id: string) => void;
  onItemHoverEnd?: () => void;
  onItemRemove?: (name: string) => void;
  onAdvancedExpandedChange?: (expanded: boolean) => void;
  /**
   * Suppress the ATOM engine footnote even when a legend label carries the ¹
   * marker. Inference charts pass this because they render the footnote in
   * the axis-metric info footer below the chart instead of in the legend.
   */
  hideAtomFootnote?: boolean;
}

export default function ChartLegend({
  legendItems,
  isLegendExpanded,
  onExpandedChange,
  switches,
  actions,
  grouped = false,
  precisionIndicators,
  keyIndicators,
  enableTooltips = false,
  maxHeight,
  containerStyle,
  variant = 'overlay',
  disableActiveSort = false,
  onItemHover,
  onItemHoverEnd,
  onItemRemove,
  onAdvancedExpandedChange,
  hideAtomFootnote = false,
}: ChartLegendProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const isSidebar = variant === 'sidebar';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
  const advancedControlsId = useId();

  // Sidebar items always render in the compact (truncate + title tooltip)
  // layout: the panel is a fixed-width in-flow column and must never grow
  // over the plot area.
  const itemsExpanded = isSidebar ? false : isLegendExpanded;
  // Counts only removable series: the guard below exists to stop the user
  // emptying the chart, and label-only entries (unofficial runs) are not
  // something removing leaves you without.
  const activeCount = useMemo(
    () => legendItems.filter((item) => item.isActive && item.isRemovable !== false).length,
    [legendItems],
  );
  const effectiveRemove = onItemRemove && activeCount > 1 ? onItemRemove : undefined;
  const removeFor = (item: CommonLegendItemProps) =>
    item.isRemovable === false ? undefined : effectiveRemove;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setIsOverflowing(el.scrollHeight > el.clientHeight - 0.5);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Sort items for sidebar mode (active-first); filtering is done via CSS hide
  const sortedItems = useMemo(() => {
    if (!isSidebar) return legendItems;
    return filterAndSortLegendItems(legendItems, '', !disableActiveSort);
  }, [legendItems, isSidebar, disableActiveSort]);

  const rows = useMemo(() => {
    if (!grouped) return null;
    const items = isSidebar ? sortedItems : legendItems;
    const hwKeys = items.map((item) => item.name.split(' ')[0]);
    const uniqueNames = [...new Set(hwKeys)];
    const result = uniqueNames.map((name) =>
      items.filter((item) => item.name.split(' ')[0] === name),
    );
    // In sidebar mode, sort groups so those with active items come first
    if (isSidebar && !disableActiveSort) {
      result.sort((a, b) => {
        const aHasActive = a.some((item) => item.isActive) ? 0 : 1;
        const bHasActive = b.some((item) => item.isActive) ? 0 : 1;
        return aHasActive - bHasActive;
      });
    }
    return result.filter((row) => row.length > 0);
  }, [grouped, legendItems, sortedItems, isSidebar]);

  const toggleLegendOpen = () => {
    onExpandedChange(!isLegendExpanded);
  };

  // Sidebar: a fixed in-flow panel that takes layout space next to the plot
  // (Epoch-style). It never overlays the chart; closing it (X) removes it
  // entirely and the chart reclaims the width.
  const outerClasses = isSidebar
    ? 'p-3 rounded-md border border-border/60 bg-background text-sm flex flex-col max-h-96 lg:max-h-[575px] legend-container sidebar-legend w-full'
    : grouped
      ? cn(
          'py-1 px-2 md:py-1 rounded-sm border text-sm top-0 right-0 bg-accent transition-all md:flex md:flex-col legend-container',
          isLegendExpanded
            ? 'md:max-w-none md:w-auto md:min-w-fit'
            : 'md:max-w-40 bg-transparent border-transparent px-1',
        )
      : cn(
          'mt-4 md:pt-8 md:p-2 rounded-sm border md:absolute text-sm top-0 right-0 bg-accent transition-all md:flex md:flex-col legend-container',
          isLegendExpanded
            ? 'md:max-w-none md:w-auto md:min-w-fit'
            : 'md:max-w-40 bg-transparent border-transparent',
        );

  const outerStyle = {
    ...(maxHeight && !isSidebar ? { maxHeight: `${maxHeight}px` } : undefined),
    ...containerStyle,
  };

  // Show ATOM footnote when any legend item label contains the ¹ marker
  const hasAtomFootnote = useMemo(
    () =>
      !hideAtomFootnote && legendItems.some((item) => item.label.includes(ATOM_FOOTNOTE_MARKER)),
    [legendItems, hideAtomFootnote],
  );

  const shapeIndicators = useMemo(() => {
    if (!precisionIndicators || precisionIndicators.length < 2) return null;
    return precisionIndicators.slice(0, SHAPE_ORDER.length).map((precision) => ({
      precision,
      shapeKey: getShapeKeyForPrecision(precision, precisionIndicators),
    }));
  }, [precisionIndicators]);

  const hasSidebarControls =
    isSidebar &&
    (shapeIndicators !== null ||
      keyIndicators ||
      (switches && switches.length > 0) ||
      hasAtomFootnote);
  const scrollClasses = isSidebar
    ? cn(
        'overflow-y-auto flex-initial min-h-0 space-y-0.5',
        hasSidebarControls && 'border-b border-border pb-2',
      )
    : grouped
      ? 'flex gap-x-4 flex-wrap flex-row md:block md:overflow-y-auto md:flex-1 md:min-h-0'
      : 'flex flex-row flex-wrap gap-x-4 gap-y-2 md:block md:overflow-y-auto md:flex-1 md:min-h-0';

  // Fully-closed sidebar: render only a reopen affordance at the top-right of
  // the chart area (all hooks above have already run unconditionally).
  if (isSidebar && !isLegendExpanded) {
    return (
      <div className="flex justify-end no-export">
        <button
          type="button"
          data-testid="legend-open-button"
          onClick={toggleLegendOpen}
          aria-label={t.showLegend}
          title={t.showLegend}
          className="p-1.5 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <PanelRight size={16} />
        </button>
      </div>
    );
  }

  const actionElements =
    actions && actions.length > 0 ? (
      <div
        className={cn(
          'no-export flex flex-wrap gap-y-1',
          isSidebar ? 'min-w-0 gap-x-1' : 'w-full gap-x-3',
        )}
      >
        {actions.map((action) => (
          <button
            type="button"
            key={action.id}
            data-testid={action.id}
            onClick={action.onClick}
            className={cn(
              'text-xs text-muted-foreground hover:text-foreground cursor-pointer',
              isSidebar
                ? 'min-h-8 rounded-md px-2 hover:bg-muted transition-colors'
                : 'mt-2 underline',
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
    ) : null;

  // Put series actions in the space previously occupied by a lone close icon.
  // The panel fits short lists; only the series region scrolls for long lists.
  const panelHeader = isSidebar ? (
    <div
      data-testid="legend-toolbar"
      className="-mx-1 -mt-1 pb-1 no-export flex shrink-0 items-start gap-1"
    >
      <div className="min-w-0 flex-1">{actionElements}</div>
      <button
        type="button"
        data-testid="legend-close-button"
        onClick={toggleLegendOpen}
        aria-label={t.hideLegend}
        title={t.hideLegend}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  ) : null;

  const standardSwitches = switches?.filter((sw) => !sw.advanced) ?? [];
  const advancedSwitches = switches?.filter((sw) => sw.advanced) ?? [];

  const renderSwitches = (items: LegendSwitchConfig[]) =>
    items.length > 0 ? (
      <div className={cn(grouped ? 'w-full space-y-0' : 'w-full md:w-auto flex flex-wrap gap-2')}>
        {items.map((sw) => (
          <div key={sw.id} className="mt-2 flex items-center gap-2">
            <Switch
              id={sw.id}
              data-testid={sw.id}
              checked={sw.checked}
              onCheckedChange={sw.onCheckedChange}
            />
            <Label
              htmlFor={sw.id}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {sw.label}
            </Label>
            {sw.infoTooltip && (
              <TooltipProvider delayDuration={100}>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-testid={`${sw.id}-info`}
                      aria-label={t.moreInfo(sw.label)}
                      className="text-muted-foreground hover:text-foreground cursor-help -m-1.5 p-1.5 inline-flex items-center"
                    >
                      <Info size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    sideOffset={6}
                    className="max-w-[260px] text-xs leading-snug"
                  >
                    {sw.infoTooltip}
                  </TooltipContent>
                </TooltipRoot>
              </TooltipProvider>
            )}
          </div>
        ))}
      </div>
    ) : null;

  const switchElements =
    switches && switches.length > 0 ? (
      <div className="w-full no-export">
        {renderSwitches(standardSwitches)}
        {advancedSwitches.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              data-testid="legend-advanced-toggle"
              aria-expanded={isAdvancedExpanded}
              aria-controls={advancedControlsId}
              onClick={() => {
                const expanded = !isAdvancedExpanded;
                setIsAdvancedExpanded(expanded);
                onAdvancedExpandedChange?.(expanded);
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isAdvancedExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {t.advanced}
            </button>
            {isAdvancedExpanded && (
              <div
                id={advancedControlsId}
                data-testid="legend-advanced-controls"
                className="ml-1 pl-3 border-l border-border"
              >
                {renderSwitches(advancedSwitches)}
              </div>
            )}
          </div>
        )}
      </div>
    ) : null;

  const fpIndicators = shapeIndicators ? (
    <div
      className={cn(
        'w-full md:w-auto mt-2 px-1 pr-2 gap-x-4 gap-y-1',
        itemsExpanded ? 'flex flex-wrap' : 'grid grid-cols-2',
      )}
    >
      {shapeIndicators.map(({ precision, shapeKey }) => {
        const Icon = SHAPE_ICON[shapeKey];
        return (
          <div key={precision} className="flex items-center gap-2">
            <Icon size={12} className="inline-block fill-gray-500" />
            <span className="text-xs text-muted-foreground">
              {getPrecisionLabel(precision as Precision)}
            </span>
          </div>
        );
      })}
    </div>
  ) : null;

  // Compute li className for a legend item (shared by tooltip and non-tooltip paths)
  const itemClassName = (item: CommonLegendItemProps) =>
    cn(
      'transition-opacity duration-300',
      isSidebar
        ? item.isActive
          ? ''
          : 'no-export'
        : item.isActive
          ? 'opacity-100'
          : 'opacity-50 no-export',
      itemsExpanded && 'md:w-full md:block',
    );

  // Render a single legend item, optionally wrapped with a tooltip
  const renderItem = (item: CommonLegendItemProps) => {
    const legendItem = (
      <ChartLegendItem
        name={item.name}
        label={item.label}
        color={item.color}
        lineDasharray={item.lineDasharray}
        title={item.title}
        isHighlighted={item.isHighlighted}
        hw={item.hw}
        isActive={item.isActive}
        onClick={item.onClick}
        onHover={onItemHover}
        onHoverEnd={onItemHoverEnd}
        onRemove={removeFor(item)}
        onShowPoints={item.onShowPoints}
        hideAriaLabel={t.hide(item.label)}
        showPointsAriaLabel={t.showPoints(item.label)}
        asFragment
        isLegendExpanded={itemsExpanded}
        sidebarMode={isSidebar}
      />
    );

    return (
      <li key={item.name} className={itemClassName(item)}>
        {enableTooltips ? (
          <TooltipRoot>
            <TooltipTrigger asChild>
              {/* Full width when the row carries a points-table icon so the
                  ml-auto icon pins to a consistent right-edge column. */}
              <div className={item.onShowPoints ? 'w-full' : 'w-fit max-w-full'}>{legendItem}</div>
            </TooltipTrigger>
            {item.isHighlighted && item.tooltip && (
              <TooltipContent side="bottom" collisionPadding={10}>
                {item.tooltip}
              </TooltipContent>
            )}
          </TooltipRoot>
        ) : (
          legendItem
        )}
      </li>
    );
  };

  // Display controls stay immediately below the series instead of being
  // pushed to the bottom of a chart-height panel. Overlay actions stay here.
  const hasBottomControls =
    switchElements ||
    (!isSidebar && actionElements) ||
    fpIndicators ||
    keyIndicators ||
    hasAtomFootnote;
  const bottomControls = hasBottomControls ? (
    <div data-testid="legend-display-controls" className="shrink-0 grow-0">
      {!isSidebar && actionElements}
      {switchElements}
      {fpIndicators}
      {keyIndicators}
      {hasAtomFootnote && <AtomEngineFootnote className="mt-2 no-export" />}
    </div>
  ) : null;

  // Scroll container content
  const scrollContent =
    grouped && rows ? (
      <div
        ref={scrollRef}
        style={isSidebar || isOverflowing ? { scrollbarGutter: 'stable' } : undefined}
        className={cn(scrollClasses, 'custom-scrollbar')}
      >
        {rows.map((row, i) => (
          <div key={i} className={cn('p-1 rounded-sm shrink-0', i > 0 && 'mt-2')}>
            <div className="text-sm font-medium text-muted-foreground gpu-legend-title whitespace-nowrap overflow-ellipsis overflow-hidden">
              {row[0].title}
            </div>
            <ul
              className={cn(
                'flex flex-wrap gap-x-2 gap-y-1',
                itemsExpanded && 'md:block md:space-y-1',
              )}
            >
              {row.map((item: CommonLegendItemProps) => (
                <li key={item.name}>
                  <ChartLegendItem
                    name={item.name}
                    hw={item.hw}
                    label={item.label}
                    color={item.color}
                    lineDasharray={item.lineDasharray}
                    title={item.title}
                    isActive={item.isActive}
                    onClick={item.onClick}
                    onHover={onItemHover}
                    onHoverEnd={onItemHoverEnd}
                    onRemove={removeFor(item)}
                    onShowPoints={item.onShowPoints}
                    hideAriaLabel={t.hide(item.label)}
                    showPointsAriaLabel={t.showPoints(item.label)}
                    isLegendExpanded={itemsExpanded}
                    sidebarMode={isSidebar}
                    asFragment
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    ) : (
      <ul
        ref={scrollRef as unknown as React.RefObject<HTMLUListElement>}
        style={isSidebar || isOverflowing ? { scrollbarGutter: 'stable' } : undefined}
        className={cn(scrollClasses, 'custom-scrollbar')}
      >
        {(isSidebar ? sortedItems : legendItems).map((item) => renderItem(item))}
      </ul>
    );

  const content = (
    <div className={isSidebar ? 'min-w-0' : 'relative'}>
      <div data-testid="chart-legend" className={outerClasses} style={outerStyle}>
        {panelHeader}
        {scrollContent}
        {bottomControls}
      </div>
    </div>
  );

  return enableTooltips ? <TooltipProvider delayDuration={0}>{content}</TooltipProvider> : content;
}
