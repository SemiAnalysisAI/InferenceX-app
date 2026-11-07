import type * as React from 'react';

import { cn } from '@/lib/shared/utils';

interface EmptyStateProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  title?: React.ReactNode;
  /** A button or link that resolves the empty state, such as clearing a filter. */
  action?: React.ReactNode;
  /** Drops the card surface when the message already sits inside a card or chart area. */
  bare?: boolean;
  titleAs?: 'p' | 'h2' | 'h3';
}

/**
 * Message for a section, table or chart with nothing to show, or for a loading or missing
 * notice in its place. Children are the description.
 */
function EmptyState({
  title,
  titleAs: Title = 'p',
  action,
  bare = false,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground',
        !bare && 'rounded-xl border border-border/30 bg-card p-6',
        className,
      )}
      {...props}
    >
      {title !== undefined && (
        <Title className="text-sm font-medium text-foreground">{title}</Title>
      )}
      {children !== undefined && <div className="max-w-prose">{children}</div>}
      {action !== undefined && <div className="mt-1">{action}</div>}
    </div>
  );
}

export { EmptyState };
