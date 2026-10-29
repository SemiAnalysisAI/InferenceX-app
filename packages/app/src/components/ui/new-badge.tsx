import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/shared/utils';

export function NewBadge({
  children,
  className,
  flashing = false,
  ...props
}: ComponentPropsWithoutRef<'span'> & {
  flashing?: boolean;
}) {
  return (
    <span
      data-new-badge-flashing={flashing ? '' : undefined}
      className={cn(
        'inline-flex h-4 min-w-8 shrink-0 items-center justify-center rounded-full bg-brand px-0.5 text-3xs font-bold leading-none uppercase tracking-normal text-primary-foreground shadow-sm',
        flashing && 'new-badge-flash',
        className,
      )}
      {...props}
    >
      <span data-new-badge-label className="flex h-full items-center justify-center text-center">
        {children}
      </span>
    </span>
  );
}
