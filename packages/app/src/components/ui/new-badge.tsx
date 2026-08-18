import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

export function NewBadge({ children, className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex h-4 w-8 shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-bold leading-none uppercase tracking-normal text-primary-foreground shadow-sm',
        className,
      )}
      {...props}
    >
      <span data-new-badge-label className="grid h-full w-full place-items-center text-center">
        {children}
      </span>
    </span>
  );
}
