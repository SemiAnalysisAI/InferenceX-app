'use client';

import { cn } from '@/lib/utils';

export interface ReplayLegendItem {
  hwKey: string;
  label: string;
  color: string;
  active: boolean;
}

interface ReplayLegendProps {
  items: ReplayLegendItem[];
  onToggle: (hwKey: string) => void;
}

/**
 * Compact list-style legend for the replay panel. Active-first sort, fixed
 * narrow width, no expand/search/precision-shape chrome — just colored
 * swatch + GPU label so both the live preview and the rasterized MP4 frame
 * stay tight.
 */
export default function ReplayLegend({ items, onToggle }: ReplayLegendProps) {
  const sorted = [...items].toSorted((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return (
    <ul
      data-testid="replay-legend"
      className="flex flex-col gap-0.5 text-xs"
      style={{ minWidth: 0 }}
    >
      {sorted.map((item) => (
        <li key={item.hwKey}>
          <button
            type="button"
            onClick={() => onToggle(item.hwKey)}
            className={cn(
              'flex items-center gap-2 w-full text-left rounded px-1.5 py-0.5 hover:bg-accent transition-colors',
              !item.active && 'opacity-40',
            )}
          >
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span
              className={cn('truncate', !item.active && 'line-through decoration-1')}
              title={item.label}
            >
              {item.label}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
