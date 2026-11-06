import type * as React from 'react';

import { cn } from '@/lib/shared/utils';

const VALUE_SIZE = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
} as const;

interface StatProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Quiet line under the figure, such as a sample size or what the value compares to. */
  detail?: React.ReactNode;
  size?: keyof typeof VALUE_SIZE;
  /** Puts the stat on its own card surface, for rows of stat tiles. */
  boxed?: boolean;
  /** Shows the figure above its label, for facts where the label reads as a continuation of the number. */
  valueFirst?: boolean;
  valueClassName?: string;
}

/**
 * A labelled figure: the label, the number and an optional detail line. Render inside a `<dl>`.
 */
function Stat({
  label,
  value,
  detail,
  size = 'md',
  boxed = false,
  valueFirst = false,
  className,
  valueClassName,
  ...props
}: StatProps) {
  return (
    <div
      data-slot="stat"
      className={cn(
        'min-w-0',
        valueFirst && 'flex flex-col',
        boxed && 'rounded-xl border border-border/30 bg-card p-3',
        className,
      )}
      {...props}
    >
      <dt
        className={cn(
          'text-muted-foreground',
          valueFirst ? 'order-2 mt-1 text-sm leading-5' : 'text-xs font-medium',
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          'font-medium whitespace-nowrap tabular-nums text-foreground',
          valueFirst ? 'order-1' : 'mt-1',
          VALUE_SIZE[size],
          valueClassName,
        )}
      >
        {value}
      </dd>
      {detail !== undefined && detail !== null && detail !== '' && (
        <dd className="order-3 mt-0.5 text-xs tabular-nums text-muted-foreground">{detail}</dd>
      )}
    </div>
  );
}

export { Stat };
