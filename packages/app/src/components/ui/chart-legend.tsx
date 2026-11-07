'use client';

import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { filterAndSortLegendItems } from '@/lib/charts/legend-utils';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

import { ATOM_FOOTNOTE_MARKER, AtomEngineFootnote } from './atom-engine-footnote';
import ChartLegendItem, { type CommonLegendItemProps } from './chart-legend-item';
import { DisclosureToggle } from './disclosure-toggle';
import { Label } from './label';
import { InfoHelp } from './option-info';
import { Switch } from './switch';
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent } from './tooltip';

export type { CommonLegendItemProps } from './chart-legend-item';

const STRINGS = {
  en: {
    advanced: 'Advanced',
    resetFilter: 'Reset filter',
    moreInfo: (label: string) => `More info about ${label}`,
    hideLegend: 'Hide legend',
    showLegend: 'Show legend',
    hide: (label: string) => `Hide ${label}`,
    showPoints: (label: string) => `Show all ${label} data points`,
  },
  zh: {
    advanced: '高级',
    resetFilter: '重置筛选',
    moreInfo: (label: string) => `查看${label}的更多信息`,
    hideLegend: '隐藏图例',
    showLegend: '显示图例',
    hide: (label: string) => `隐藏${label}`,
    showPoints: (label: string) => `显示${label}的全部数据点`,
  },
} as const;

const SCROLL_FADE_PX = 24;
const OVERFLOW_STRIP_PX = 14;
const STRETCHED_LEGEND_QUERY = '(min-width: 64rem)';

export interface LegendSwitchConfig {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  infoTooltip?: React.ReactNode;
  advanced?: boolean;
}

export interface LegendActionConfig {
  id: string;
  label: string;
  onClick: () => void;
}

export interface LegendResetConfig {
  id: string;
  onClick: () => void;
  disabled: boolean;
}

export interface ChartLegendProps {
  legendItems: CommonLegendItemProps[];
  isLegendExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  switches?: LegendSwitchConfig[];
  reset?: LegendResetConfig;
  actions?: LegendActionConfig[];
  grouped?: boolean;
  keyIndicators?: React.ReactNode;
  enableTooltips?: boolean;
  maxHeight?: number;
  containerStyle?: React.CSSProperties;
  variant?: 'overlay' | 'sidebar';
  disableActiveSort?: boolean;
  onItemHover?: (id: string) => void;
  onItemHoverEnd?: () => void;
  onItemRemove?: (name: string) => void;
  onAdvancedExpandedChange?: (expanded: boolean) => void;
  hideAtomFootnote?: boolean;
  readOnly?: boolean;
  /** An enclosing panel can own expansion instead of the legend itself. */
  collapsible?: boolean;
}

export default function ChartLegend({
  legendItems,
  isLegendExpanded: expandedProp,
  onExpandedChange,
  switches,
  reset,
  actions,
  grouped = false,
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
  readOnly = false,
  collapsible = true,
}: ChartLegendProps) {
  const isLegendExpanded = collapsible ? expandedProp : true;
  const locale = useLocale();
  const t = STRINGS[locale];
  const isSidebar = variant === 'sidebar';
  if (readOnly) {
    switches = undefined;
    reset = undefined;
    actions = undefined;
    onItemRemove = undefined;
    enableTooltips = false;
  }
  const items = useMemo(
    () =>
      readOnly
        ? legendItems.map((item) => ({
            ...item,
            onShowPoints: undefined,
            tooltip: null,
            isHighlighted: false,
          }))
        : legendItems,
    [legendItems, readOnly],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const [stripHeight, setStripHeight] = useState<number | null>(null);
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
  const advancedControlsId = useId();

  const itemsExpanded = isSidebar ? false : isLegendExpanded;
  const activeCount = useMemo(
    () => items.filter((item) => item.isActive && item.isRemovable !== false).length,
    [items],
  );
  const effectiveRemove = onItemRemove && activeCount > 1 ? onItemRemove : undefined;
  const removeFor = (item: CommonLegendItemProps) =>
    item.isRemovable === false ? undefined : effectiveRemove;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const panel = el.parentElement;
    const updateScroll = () => {
      setIsOverflowing(el.scrollHeight > el.clientHeight - 0.5);
      setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 1);
    };
    const update = () => {
      updateScroll();
      if (!isSidebar || !panel || window.matchMedia(STRETCHED_LEGEND_QUERY).matches) {
        setStripHeight(null);
        return;
      }
      const strip = panel.querySelector<HTMLElement>('[data-testid="legend-overflow-strip"]');
      const room = Math.min(
        el.scrollHeight,
        Number.parseFloat(getComputedStyle(panel).maxHeight) -
          (panel.offsetHeight - el.offsetHeight - (strip?.offsetHeight ?? 0)),
      );
      let lastRowBottom = 0;
      for (const row of el.querySelectorAll('li')) {
        const bottom = row.offsetTop + row.offsetHeight;
        if (bottom + OVERFLOW_STRIP_PX <= room) lastRowBottom = Math.max(lastRowBottom, bottom);
      }
      setStripHeight(el.scrollHeight > room + 0.5 && lastRowBottom > 0 ? lastRowBottom : null);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (panel) observer.observe(panel);
    el.addEventListener('scroll', updateScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', updateScroll);
    };
  }, [items, isLegendExpanded, isSidebar]);

  const sortedItems = useMemo(() => {
    if (!isSidebar) return items;
    return filterAndSortLegendItems(items, '', !disableActiveSort);
  }, [items, isSidebar, disableActiveSort]);

  const rows = useMemo(() => {
    if (!grouped) return null;
    const source = isSidebar ? sortedItems : items;
    const hwKeys = source.map((item) => item.name.split(' ')[0]);
    const uniqueNames = [...new Set(hwKeys)];
    const result = uniqueNames.map((name) =>
      source.filter((item) => item.name.split(' ')[0] === name),
    );
    if (isSidebar && !disableActiveSort) {
      result.sort((a, b) => {
        const aHasActive = a.some((item) => item.isActive) ? 0 : 1;
        const bHasActive = b.some((item) => item.isActive) ? 0 : 1;
        return aHasActive - bHasActive;
      });
    }
    return result.filter((row) => row.length > 0);
  }, [grouped, items, sortedItems, isSidebar]);

  const toggleLegendOpen = () => {
    onExpandedChange(!isLegendExpanded);
  };

  const outerClasses = isSidebar
    ? cn(
        'relative px-2 py-3 rounded-lg border bg-background text-sm flex flex-col w-full min-h-0',
        isLegendExpanded
          ? 'border-border/30 max-h-96 lg:max-h-[575px] legend-container sidebar-legend'
          : 'border-transparent no-export',
      )
    : grouped
      ? cn(
          'py-1 px-2 rounded-lg border text-sm top-0 right-0 transition-colors md:flex md:flex-col legend-container',
          isLegendExpanded
            ? 'border-border/30 bg-card md:max-w-none md:w-auto md:min-w-fit'
            : 'md:max-w-40 bg-transparent border-transparent px-1',
        )
      : cn(
          'mt-4 md:pt-8 md:p-2 rounded-lg border md:absolute text-sm top-0 right-0 transition-colors md:flex md:flex-col legend-container',
          isLegendExpanded
            ? 'border-border/30 bg-card md:max-w-none md:w-auto md:min-w-fit'
            : 'md:max-w-40 bg-transparent border-transparent',
        );

  const outerStyle = {
    ...(maxHeight && !isSidebar ? { maxHeight: `${maxHeight}px` } : undefined),
    ...containerStyle,
  };

  const hasAtomFootnote = useMemo(
    () => !hideAtomFootnote && items.some((item) => item.label.includes(ATOM_FOOTNOTE_MARKER)),
    [items, hideAtomFootnote],
  );

  const headerButtons: (LegendActionConfig & { disabled?: boolean })[] = [
    ...(reset ? [{ ...reset, label: t.resetFilter }] : []),
    ...(actions ?? []),
  ];
  const scrollClasses = isSidebar
    ? 'relative overflow-y-auto flex-initial min-h-0 space-y-0.5 pb-2'
    : grouped
      ? 'flex gap-x-4 flex-wrap flex-row md:block md:overflow-y-auto md:flex-1 md:min-h-0'
      : 'flex flex-row flex-wrap gap-x-4 gap-y-2 md:block md:overflow-y-auto md:flex-1 md:min-h-0';

  const actionElements =
    headerButtons.length > 0 ? (
      <div
        className={cn(
          'no-export flex flex-wrap gap-y-1',
          isSidebar ? 'min-w-0 gap-x-1' : 'w-full gap-x-3',
        )}
      >
        {headerButtons.map((action) => (
          <button
            type="button"
            key={action.id}
            data-testid={action.id}
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(
              'text-xs text-muted-foreground enabled:hover:text-foreground enabled:cursor-pointer disabled:opacity-80',
              isSidebar
                ? 'min-h-8 rounded-md px-2 enabled:hover:bg-muted transition-colors'
                : 'mt-2 underline',
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
    ) : null;

  const LegendToggleIcon = isLegendExpanded ? PanelRightClose : PanelRightOpen;
  const toggleButton = collapsible ? (
    <button
      type="button"
      data-testid={isLegendExpanded ? 'legend-close-button' : 'legend-open-button'}
      onClick={toggleLegendOpen}
      aria-expanded={isLegendExpanded}
      aria-label={isLegendExpanded ? t.hideLegend : t.showLegend}
      title={isLegendExpanded ? t.hideLegend : t.showLegend}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
    >
      <LegendToggleIcon size={16} aria-hidden="true" />
    </button>
  ) : null;
  const panelHeader =
    isSidebar && (collapsible || actionElements) ? (
      <div
        data-testid="legend-toolbar"
        className="-mx-1 -mt-1 pb-1 no-export flex shrink-0 items-start gap-1"
      >
        <div className="min-w-0 flex-1">{isLegendExpanded && actionElements}</div>
        {toggleButton}
      </div>
    ) : null;

  const standardSwitches = switches?.filter((sw) => !sw.advanced) ?? [];
  const advancedSwitches = switches?.filter((sw) => sw.advanced) ?? [];

  const renderSwitches = (list: LegendSwitchConfig[]) =>
    list.length > 0 ? (
      <div
        className={cn(
          isSidebar || grouped ? 'w-full space-y-0' : 'w-full md:w-auto flex flex-wrap gap-2',
        )}
      >
        {list.map((sw) => (
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
              <InfoHelp
                label={sw.label}
                value={sw.id}
                triggerTestId={`${sw.id}-info`}
                ariaLabel={t.moreInfo(sw.label)}
                triggerClassName="-my-1"
              >
                {sw.infoTooltip}
              </InfoHelp>
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
            <DisclosureToggle
              open={isAdvancedExpanded}
              data-testid="legend-advanced-toggle"
              aria-controls={advancedControlsId}
              onClick={() => {
                const expanded = !isAdvancedExpanded;
                setIsAdvancedExpanded(expanded);
                onAdvancedExpandedChange?.(expanded);
              }}
              className="text-xs"
            >
              {t.advanced}
            </DisclosureToggle>
            {isAdvancedExpanded && (
              <div
                id={advancedControlsId}
                data-testid="legend-advanced-controls"
                className="ml-1 pl-3 border-l border-border/50"
              >
                {renderSwitches(advancedSwitches)}
              </div>
            )}
          </div>
        )}
      </div>
    ) : null;

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
        blockedReason={item.blockedReason}
        idScope={item.idScope}
      />
    );

    return (
      <li key={item.name} className={itemClassName(item)}>
        {enableTooltips ? (
          <TooltipRoot>
            <TooltipTrigger asChild>
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

  const hasBottomControls =
    switchElements || (!isSidebar && actionElements) || keyIndicators || hasAtomFootnote;
  const bottomControls = hasBottomControls ? (
    <div
      data-testid="legend-display-controls"
      className={cn(
        'shrink-0 grow-0',
        isSidebar && 'min-w-0 border-t border-border/50 [contain:inline-size]',
      )}
    >
      {!isSidebar && actionElements}
      {switchElements}
      {keyIndicators}
      {hasAtomFootnote && <AtomEngineFootnote className="mt-2 no-export" />}
    </div>
  ) : null;

  const fadeMask = `linear-gradient(to bottom, black calc(100% - ${SCROLL_FADE_PX}px), transparent)`;
  const scrollStyle: React.CSSProperties = {
    ...(!isSidebar && isOverflowing ? { scrollbarGutter: 'stable' } : undefined),
    ...(stripHeight === null ? undefined : { maxHeight: stripHeight, paddingBottom: 0 }),
    ...(hasMoreBelow && stripHeight === null
      ? { maskImage: fadeMask, WebkitMaskImage: fadeMask }
      : undefined),
  };
  const overflowStrip =
    stripHeight === null ? null : (
      <div
        aria-hidden="true"
        data-testid="legend-overflow-strip"
        className="shrink-0"
        style={{
          height: OVERFLOW_STRIP_PX,
          background: hasMoreBelow
            ? 'linear-gradient(to bottom, color-mix(in srgb, var(--background) 0%, transparent), var(--background))'
            : undefined,
        }}
      />
    );

  const scrollContent =
    grouped && rows ? (
      <div ref={scrollRef} style={scrollStyle} className={cn(scrollClasses, 'custom-scrollbar')}>
        {rows.map((row, i) => (
          <div key={i} className={cn('shrink-0', i > 0 && 'mt-2', !isSidebar && 'p-1')}>
            <div className="text-sm font-medium text-muted-foreground gpu-legend-title whitespace-nowrap overflow-ellipsis overflow-hidden">
              {row[0].title}
            </div>
            <ul
              className={cn(
                isSidebar ? 'space-y-0.5' : 'flex flex-wrap gap-x-2 gap-y-1',
                itemsExpanded && 'md:block md:space-y-1',
              )}
            >
              {row.map((item: CommonLegendItemProps) => renderItem(item))}
            </ul>
          </div>
        ))}
      </div>
    ) : (
      <ul
        ref={scrollRef as unknown as React.RefObject<HTMLUListElement>}
        style={scrollStyle}
        className={cn(scrollClasses, 'custom-scrollbar')}
      >
        {(isSidebar ? sortedItems : items)
          .filter((item) => !item.section)
          .map((item) => renderItem(item))}
        {[...new Set(items.flatMap((item) => (item.section ? [item.section] : [])))].map(
          (section) => (
            <React.Fragment key={`section:${section}`}>
              <li
                className={cn(
                  'mt-1.5 border-t border-border/60 pt-1.5 text-xs font-medium text-muted-foreground',
                  itemsExpanded && 'md:w-full md:block',
                )}
                data-testid="legend-section-heading"
              >
                {section}
              </li>
              {items.filter((item) => item.section === section).map((item) => renderItem(item))}
            </React.Fragment>
          ),
        )}
      </ul>
    );

  const content = (
    <div
      className={
        isSidebar
          ? 'min-w-0 lg:flex lg:min-h-0 lg:flex-col lg:in-data-[slot=chart-legend-wrapper]:flex-1'
          : 'relative'
      }
    >
      <div
        data-testid={!isSidebar || isLegendExpanded ? 'chart-legend' : undefined}
        className={outerClasses}
        style={outerStyle}
      >
        {panelHeader}
        {(!isSidebar || isLegendExpanded) && scrollContent}
        {(!isSidebar || isLegendExpanded) && overflowStrip}
        {(!isSidebar || isLegendExpanded) && bottomControls}
      </div>
    </div>
  );

  return enableTooltips ? <TooltipProvider delayDuration={0}>{content}</TooltipProvider> : content;
}
