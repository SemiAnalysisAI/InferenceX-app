import { Table2, X } from 'lucide-react';
import React from 'react';

import { cn } from '@/lib/utils';

export interface CommonLegendItemProps {
  name: string;
  hw?: string;
  label: string;
  color: string;
  isActive: boolean;
  isHighlighted?: boolean;
  onClick: (name: string) => void;
  onHover?: (id: string) => void;
  onHoverEnd?: () => void;
  title?: string; // Optional for GPU title or other descriptive text
  asFragment?: boolean; // If true, don't render the <li> wrapper
  tooltip?: React.JSX.Element | null;
  isLegendExpanded?: boolean; // Whether the legend is expanded to show full text
  sidebarMode?: boolean; // Use sidebar-style visual feedback (line-through + faded dot)
  onRemove?: (name: string) => void;
  /**
   * When provided, renders a small table icon that opens a per-series points
   * table (all data points for this hardware/framework series). Only the
   * inference tab's legend passes this — other tabs get no icon.
   */
  onShowPoints?: (name: string) => void;
}

const ChartLegendItem: React.FC<CommonLegendItemProps> = ({
  name,
  label,
  color,
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
}) => {
  const id = `checkbox-${hw || name}`; // Unique ID for accessibility
  const isLongText = (label ?? '').length > 8;
  const canRemove = isActive && Boolean(onRemove);

  const content = (
    <>
      <input
        type="checkbox"
        id={id}
        checked={isActive}
        onChange={() => onClick(hw || name)}
        className="hidden peer"
      />
      <label
        htmlFor={id}
        className={cn(
          'group/item flex items-center cursor-pointer hover:underline peer-focus-visible:ring-1 peer-focus-visible:ring-offset-1 peer-focus-visible:outline-none rounded-sm',
          isLegendExpanded ? 'w-fit whitespace-nowrap' : '',
        )}
        title={!isLegendExpanded && isLongText ? label : title}
        onMouseEnter={onHover && isActive ? () => onHover(hw || name) : undefined}
        onMouseLeave={onHoverEnd && isActive ? onHoverEnd : undefined}
      >
        <span className="relative inline-flex items-center justify-center size-3 mr-2 flex-shrink-0">
          <span
            className={cn(
              'size-3 rounded-full transition-opacity',
              canRemove && 'group-hover/item:opacity-0!',
            )}
            style={{ backgroundColor: color, opacity: sidebarMode && !isActive ? 0.3 : 1 }}
          />
          {canRemove && (
            <span
              role="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove!(hw || name);
              }}
              className="absolute inset-0 inline-flex items-center justify-center opacity-0 group-hover/item:opacity-100"
              aria-label={`Hide ${label}`}
            >
              <X size={14} strokeWidth={4} className="text-foreground" />
            </span>
          )}
        </span>
        <span
          className={cn(
            'pr-2',
            isLongText && !isLegendExpanded
              ? 'truncate'
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
          aria-label={`Show all ${label} data points`}
          onClick={() => onShowPoints(hw || name)}
          // Reduced opacity at rest (still visible/tappable on touch), full on
          // row hover or keyboard focus. ml-auto pins the icon to the row's
          // right edge so icons align in a column across variable-length labels.
          className="ml-auto shrink-0 p-1 -my-1 rounded-sm text-muted-foreground hover:text-foreground opacity-35 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity no-export"
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
