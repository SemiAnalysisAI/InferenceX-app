'use client';

import { track } from '@/lib/analytics';
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  Circle,
  Diamond,
  Square,
  Triangle,
  X,
} from 'lucide-react';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { filterAndSortLegendItems } from '@/lib/legend-utils';
import { cn } from '@/lib/utils';

import ChartLegendItem, { CommonLegendItemProps } from './chart-legend-item';
import { Label } from './label';
import { Switch } from './switch';
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from './tooltip';

export type { CommonLegendItemProps } from './chart-legend-item';

export interface LegendSwitchConfig {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
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
  showFpShapeIndicators?: boolean;
  showResetFilter?: boolean;
  allSelected?: boolean;
  onResetFilter?: () => void;
  enableTooltips?: boolean;
  maxHeight?: number;
  /** Override styles on the outer legend container (e.g. maxHeight to constrain scrollable area) */
  containerStyle?: React.CSSProperties;
  variant?: 'overlay' | 'sidebar';
  disableActiveSort?: boolean;
  onItemHover?: (id: string) => void;
  onItemHoverEnd?: () => void;
  onItemRemove?: (name: string) => void;
}

export default function ChartLegend({
  legendItems,
  isLegendExpanded,
  onExpandedChange,
  switches,
  actions,
  grouped = false,
  showFpShapeIndicators = false,
  showResetFilter = false,
  allSelected = true,
  onResetFilter,
  enableTooltips = false,
  maxHeight,
  containerStyle,
  variant = 'overlay',
  disableActiveSort = false,
  onItemHover,
  onItemHoverEnd,
  onItemRemove,
}: ChartLegendProps) {
  const isSidebar = variant === 'sidebar';
  const [hasLongText, setHasLongText] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const effectiveExpanded = isLegendExpanded;
  const activeCount = useMemo(
    () => legendItems.filter((item) => item.isActive).length,
    [legendItems],
  );
  const effectiveRemove = onItemRemove && activeCount > 1 ? onItemRemove : undefined;

  useLayoutEffect(() => {
    setHasLongText(legendItems.some((item) => item.label && item.label.length > 8));
  }, [legendItems]);

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

  // Compute which items match the search query (used to hide non-matching via CSS)
  const hiddenNames = useMemo(() => {
    if (!isSidebar) return new Set<string>();
    const query = searchQuery.trim().toLowerCase();
    if (!query) return new Set<string>();
    return new Set(
      legendItems
        .filter(
          (item) =>
            !item.label.toLowerCase().includes(query) &&
            !(item.title && item.title.toLowerCase().includes(query)),
        )
        .map((item) => item.name),
    );
  }, [legendItems, searchQuery, isSidebar]);

  const rows = useMemo(() => {
    if (!grouped) return null;
    const items = isSidebar ? sortedItems : legendItems;
    const hwKeys = items.map((item) => item.name.split(' ')[0]);
    const uniqueNames = [...new Set(hwKeys)];
    const result = uniqueNames.map((name) => {
      return items.filter((item) => item.name.split(' ')[0] === name);
    });
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

  const handleLegendExpand = () => {
    onExpandedChange(!isLegendExpanded);
  };

  const outerClasses = isSidebar
    ? cn(
        'p-2 rounded-sm text-sm flex flex-col h-full legend-container sidebar-legend transition-all',
        isLegendExpanded
          ? 'absolute right-0 top-0 z-10 w-auto min-w-fit border bg-accent'
          : 'w-full',
      )
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
    () => legendItems.some((item) => item.label.includes('¹')),
    [legendItems],
  );

  const hasSidebarControls =
    isSidebar &&
    (showFpShapeIndicators ||
      (switches && switches.length > 0) ||
      (actions && actions.length > 0) ||
      hasLongText ||
      (showResetFilter && !allSelected));
  const scrollClasses = isSidebar
    ? cn(
        'overflow-y-auto flex-1 min-h-0 space-y-0.5',
        hasSidebarControls && 'border-b border-border pb-2',
      )
    : grouped
      ? 'flex gap-x-4 flex-wrap flex-row md:block md:overflow-y-auto md:flex-1 md:min-h-0'
      : 'flex flex-row flex-wrap gap-x-4 gap-y-2 md:block md:overflow-y-auto md:flex-1 md:min-h-0';

  const trackSearchOnBlur = useCallback(() => {
    if (searchQuery.trim()) {
      track('inference_legend_searched', { query: searchQuery.trim() });
    }
  }, [searchQuery]);

  const searchInput =
    isSidebar && isLegendExpanded ? (
      <div className="pb-1.5 no-export">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onBlur={trackSearchOnBlur}
            placeholder="Search..."
            className="w-full px-2 py-1 pr-6 rounded-md border border-border bg-background text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => {
                track('inference_legend_search_cleared');
                setSearchQuery('');
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
    ) : null;

  const switchElements =
    switches && switches.length > 0 ? (
      <div
        className={cn(
          grouped ? 'w-full space-y-0' : 'w-full md:w-auto flex flex-wrap gap-2',
          'no-export',
        )}
      >
        {switches.map((sw) => (
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
          </div>
        ))}
      </div>
    ) : null;

  const actionElements =
    actions && actions.length > 0 ? (
      <div className="w-full no-export">
        {actions.map((action) => (
          <button
            key={action.id}
            data-testid={action.id}
            onClick={action.onClick}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
          >
            {action.label}
          </button>
        ))}
      </div>
    ) : null;

  const fpIndicators = showFpShapeIndicators ? (
    <div
      className={cn(
        'w-full md:w-auto mt-2 px-1 pr-2 gap-x-4 gap-y-1',
        effectiveExpanded ? 'flex flex-wrap' : 'grid grid-cols-2',
      )}
    >
      <div className="flex items-center gap-2">
        <Circle size={12} className="inline-block fill-gray-500" />
        <span className="text-xs text-muted-foreground">FP4</span>
      </div>
      <div className="flex items-center gap-2">
        <Square size={12} className="inline-block fill-gray-500" />
        <span className="text-xs text-muted-foreground">FP8</span>
      </div>
      <div className="flex items-center gap-2">
        <Triangle size={12} className="inline-block fill-gray-500" />
        <span className="text-xs text-muted-foreground">BF16</span>
      </div>
      <div className="flex items-center gap-2">
        <Diamond size={12} className="inline-block fill-gray-500" />
        <span className="text-xs text-muted-foreground">INT4</span>
      </div>
    </div>
  ) : null;

  const expandButton = hasLongText ? (
    <div className="hidden lg:block mt-2 no-export">
      <button
        onClick={handleLegendExpand}
        className="text-xs text-accent-foreground hover:text-foreground flex items-center gap-1"
        aria-label={isLegendExpanded ? 'Collapse legend' : 'Expand legend'}
      >
        {isLegendExpanded ? <ArrowRightToLine size={16} /> : <ArrowLeftToLine size={16} />}
        {isLegendExpanded ? 'Collapse' : 'Expand'}
      </button>
    </div>
  ) : null;

  const resetFilter =
    showResetFilter && !allSelected ? (
      <div className="no-export mt-2">
        <button
          onClick={onResetFilter}
          className="text-xs text-muted-foreground hover:text-foreground underline"
          aria-label="Reset filter"
        >
          Reset filter
        </button>
      </div>
    ) : null;

  // Compute li className for a legend item (shared by tooltip and non-tooltip paths)
  const itemClassName = (item: CommonLegendItemProps, isHidden: boolean) =>
    cn(
      'transition-opacity duration-300',
      isSidebar
        ? item.isActive
          ? ''
          : 'no-export'
        : item.isActive
          ? 'opacity-100'
          : 'opacity-50 no-export',
      item.isHighlighted ? 'text-red-900 font-bold' : '',
      effectiveExpanded && 'md:w-full md:block',
      isHidden && 'h-0 m-0! p-0! overflow-hidden',
    );

  // Render a single legend item, optionally wrapped with a tooltip
  const renderItem = (item: CommonLegendItemProps, isHidden: boolean) => {
    const legendItem = (
      <ChartLegendItem
        name={item.name}
        label={item.label}
        color={item.color}
        title={item.title}
        isHighlighted={item.isHighlighted}
        hw={item.hw}
        isActive={item.isActive}
        onClick={item.onClick}
        onHover={onItemHover}
        onHoverEnd={onItemHoverEnd}
        onRemove={effectiveRemove}
        asFragment
        isLegendExpanded={effectiveExpanded}
        sidebarMode={isSidebar}
      />
    );

    return (
      <li key={item.name} className={itemClassName(item, isHidden)}>
        {enableTooltips ? (
          <TooltipRoot>
            <TooltipTrigger asChild>
              <div className="w-fit">{legendItem}</div>
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

  // Bottom controls (switches, FP indicators, expand button, reset filter)
  const hasBottomControls =
    resetFilter ||
    switchElements ||
    actionElements ||
    fpIndicators ||
    expandButton ||
    hasAtomFootnote;
  const bottomControls = hasBottomControls ? (
    <div className="shrink-0 grow-0">
      {resetFilter}
      {switchElements}
      {actionElements}
      {fpIndicators}
      {expandButton}
      {hasAtomFootnote && (
        <p className="mt-2 text-[10px] text-muted-foreground/70 leading-tight no-export">
          <sup>1</sup> The ATOM engine is promising, however it has yet to serve production tokens.
          It is still in its infant stage.
        </p>
      )}
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
        {rows.map((row, i) => {
          const allHidden =
            isSidebar && row.every((item: CommonLegendItemProps) => hiddenNames.has(item.name));
          return (
            <div
              key={i}
              className={cn(
                'p-1 rounded-sm mt-2 shrink-0',
                allHidden && 'h-0 m-0! p-0! overflow-hidden',
              )}
            >
              <div className="text-sm font-medium text-muted-foreground gpu-legend-title whitespace-nowrap overflow-ellipsis overflow-hidden">
                {row[0].title}
              </div>
              <ul
                className={cn(
                  'flex flex-wrap gap-x-2 gap-y-1',
                  effectiveExpanded && 'md:block md:space-y-1',
                )}
              >
                {row.map((item: CommonLegendItemProps) => {
                  const isHidden = isSidebar && hiddenNames.has(item.name);
                  return (
                    <li key={item.name} className={cn(isHidden && 'h-0 m-0! p-0! overflow-hidden')}>
                      <ChartLegendItem
                        name={item.name}
                        hw={item.hw}
                        label={item.label}
                        color={item.color}
                        title={item.title}
                        isActive={item.isActive}
                        onClick={item.onClick}
                        onHover={onItemHover}
                        onHoverEnd={onItemHoverEnd}
                        onRemove={effectiveRemove}
                        sidebarMode={isSidebar}
                        asFragment
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    ) : (
      <ul
        ref={scrollRef as unknown as React.RefObject<HTMLUListElement>}
        style={isSidebar || isOverflowing ? { scrollbarGutter: 'stable' } : undefined}
        className={cn(scrollClasses, 'custom-scrollbar')}
      >
        {(isSidebar ? sortedItems : legendItems).map((item) =>
          renderItem(item, isSidebar && hiddenNames.has(item.name)),
        )}
      </ul>
    );

  const content = (
    <div className={isSidebar ? 'h-full' : 'relative'}>
      <div data-testid="chart-legend" className={outerClasses} style={outerStyle}>
        {searchInput}
        {scrollContent}
        {bottomControls}
      </div>
    </div>
  );

  return enableTooltips ? <TooltipProvider delayDuration={0}>{content}</TooltipProvider> : content;
}
