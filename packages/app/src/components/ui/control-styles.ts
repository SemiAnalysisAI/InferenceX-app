import type { CSSProperties } from 'react';

export const CONTROL_HEIGHT = {
  default: 'h-11 md:h-9',
  sm: 'h-11 md:h-8',
} as const;

export const CONTROL_MIN_HEIGHT = {
  default: 'min-h-11 md:min-h-9',
  sm: 'min-h-11 md:min-h-8',
} as const;

export const CONTROL_FOCUS = 'outline-none';

export function rangeProgressStyle(value: number, min: number, max: number): CSSProperties {
  const progress = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return { '--range-progress': `${Math.min(100, Math.max(0, progress))}%` } as CSSProperties;
}

export const HEADER_ACTION_STYLE =
  'inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-200 focus-visible:outline-none cursor-pointer';

export const SELECT_TRIGGER_STYLE =
  "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex min-w-0 items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-sm font-normal shadow-xs transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-60";

export const CONTROL_SEARCH_STYLE =
  'h-11 min-w-0 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:h-8 md:text-sm';

export const CONTROL_SEARCH_CLEAR_STYLE =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:size-8';

export const CONTROL_OPTION_STYLE = 'min-h-11 md:min-h-8';

export const TABLE_HEAD_ROW_STYLE = 'border-b border-border';

export const TABLE_HEAD_CELL_STYLE = 'whitespace-nowrap text-xs font-medium text-muted-foreground';

export const SEGMENTED_CONTAINER_STYLE =
  'inline-flex min-h-11 min-w-0 max-w-full flex-wrap items-stretch rounded-md border border-border dark:border-input gap-0.5 [--segmented-inset:1px] md:[--segmented-inset:3px] md:p-0.5 md:min-h-8';

/** Segment inside `SEGMENTED_CONTAINER_STYLE`: the container's radius minus its inset. */
export const SEGMENT_RADIUS_STYLE =
  'rounded-[max(0px,calc(var(--radius)-2px-var(--segmented-inset)))]';
