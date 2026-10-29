import { Plus, Table2, X } from 'lucide-react';
import React from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

const STRINGS = {
  en: {
    hide: (label: string) => `Hide ${label}`,
    show: (label: string) => `Show ${label}`,
    showAllPoints: (label: string) => `Show all ${label} data points`,
  },
  zh: {
    hide: (label: string) => `隐藏 ${label}`,
    show: (label: string) => `显示 ${label}`,
    showAllPoints: (label: string) => `显示 ${label} 的全部数据点`,
  },
} as const;

export interface CommonLegendItemProps {
  name: string;
  hw?: string;
  label: string;
  color: string;
  lineDasharray?: string;
  isActive: boolean;
  isHighlighted?: boolean;
  onClick: (name: string) => void;
  onHover?: (id: string) => void;
  onHoverEnd?: () => void;
  title?: string;
  asFragment?: boolean;
  tooltip?: React.JSX.Element | null;
  isLegendExpanded?: boolean;
  sidebarMode?: boolean;
  onRemove?: (name: string) => void;
  hideAriaLabel?: string;
  isRemovable?: boolean;
  onShowPoints?: (name: string) => void;
  showPointsAriaLabel?: string;
  /** Items sharing a section render after the main list under that heading, in given order. */
  section?: string;
  /** Why enabling this inactive item is blocked; shown as its tooltip with a not-allowed cursor. */
  blockedReason?: string;
}

const ChartLegendItem: React.FC<CommonLegendItemProps> = ({
  name,
  label,
  color,
  lineDasharray,
  title,
  isActive,
  onClick,
  onHover,
  onHoverEnd,
  hw,
  isHighlighted,
  asFragment = false,
  isLegendExpanded = true,
  sidebarMode = false,
  onRemove,
  onShowPoints,
  hideAriaLabel,
  showPointsAriaLabel,
  blockedReason,
}) => {
  const locale = useLocale();
  const t = STRINGS[locale];
  const id = `checkbox-${hw || name}`;
  const isLongText = (label ?? '').length > 8;
  const canRemove = isActive && Boolean(onRemove);
  const isBlocked = !isActive && Boolean(blockedReason);
  const canRestore = !isActive && !isBlocked;
  const blockedReasonId = `${id}-blocked-reason`;

  const content = (
    <>
      <input
        type="checkbox"
        id={id}
        checked={isActive}
        onChange={() => onClick(hw || name)}
        aria-disabled={isBlocked || undefined}
        aria-describedby={isBlocked ? blockedReasonId : undefined}
        className="sr-only peer"
      />
      {isBlocked && (
        <span id={blockedReasonId} className="sr-only">
          {blockedReason}
        </span>
      )}
      <label
        htmlFor={id}
        className={cn(
          'group/item flex items-center rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-ring',
          isBlocked ? 'cursor-not-allowed' : 'cursor-pointer hover:underline',
          isLegendExpanded ? 'w-fit whitespace-nowrap' : 'max-w-full',
          sidebarMode && 'min-w-0',
        )}
        title={isBlocked ? blockedReason : !isLegendExpanded && isLongText ? label : title}
        data-blocked={isBlocked || undefined}
        onMouseEnter={onHover && isActive ? () => onHover(hw || name) : undefined}
        onMouseLeave={onHoverEnd && isActive ? onHoverEnd : undefined}
      >
        <span
          className={cn(
            'relative inline-flex h-3 items-center justify-center mr-2 flex-shrink-0',
            lineDasharray === undefined ? 'w-3' : 'w-6',
          )}
        >
          {lineDasharray === undefined ? (
            <span
              className={cn(
                'size-3 rounded-full transition-opacity',
                (canRemove || canRestore) && 'group-hover/item:opacity-0!',
              )}
              style={{ backgroundColor: color, opacity: sidebarMode && !isActive ? 0.3 : 1 }}
            />
          ) : (
            <svg
              width="24"
              height="12"
              viewBox="0 0 24 12"
              data-testid="legend-line-swatch"
              className={cn(
                'transition-opacity',
                (canRemove || canRestore) && 'group-hover/item:opacity-0!',
              )}
              style={{ opacity: sidebarMode && !isActive ? 0.3 : 1 }}
              aria-hidden="true"
            >
              <line
                x1="1"
                y1="6"
                x2="23"
                y2="6"
                stroke={color}
                strokeWidth="2.25"
                strokeDasharray={lineDasharray === 'none' ? undefined : lineDasharray}
              />
            </svg>
          )}
          {canRemove && (
            <span
              role="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove!(hw || name);
              }}
              className="absolute inset-0 inline-flex items-center justify-center opacity-0 group-hover/item:opacity-100"
              aria-label={hideAriaLabel ?? t.hide(label)}
              title={t.hide(label)}
            >
              <X size={14} strokeWidth={4} className="text-foreground" />
            </span>
          )}
          {canRestore && (
            <span
              className="absolute inset-0 inline-flex items-center justify-center opacity-0 group-hover/item:opacity-100"
              title={t.show(label)}
              aria-hidden="true"
            >
              <Plus size={14} strokeWidth={4} className="text-foreground" />
            </span>
          )}
        </span>
        <span
          className={cn(
            sidebarMode ? 'pr-1' : 'pr-2',
            isLongText && !isLegendExpanded
              ? 'truncate min-w-0'
              : isLegendExpanded
                ? 'whitespace-nowrap'
                : 'whitespace-normal',
            sidebarMode && !isActive && 'opacity-40',
          )}
        >
          {label}
        </span>
      </label>
      {onShowPoints && (
        <button
          type="button"
          data-testid={`legend-points-${hw || name}`}
          aria-label={showPointsAriaLabel ?? t.showAllPoints(label)}
          onClick={() => onShowPoints(hw || name)}
          className="ml-auto shrink-0 p-1 -my-1 rounded-sm text-muted-foreground hover:text-foreground opacity-35 group-hover/row:opacity-100 transition-opacity no-export"
        >
          <Table2 size={13} />
        </button>
      )}
    </>
  );

  const wrapperClassName = cn(
    'transition-opacity duration-300',
    isActive ? 'opacity-100' : sidebarMode ? 'no-export' : 'opacity-50 no-export',
    isHighlighted && 'text-red-900 dark:text-red-400 font-bold',
    onShowPoints && 'group/row flex w-full items-center',
  );

  if (asFragment) {
    return (
      <div key={hw || name} className={wrapperClassName}>
        {content}
      </div>
    );
  }

  return (
    <li key={hw || name} className={wrapperClassName}>
      {content}
    </li>
  );
};

export default ChartLegendItem;
