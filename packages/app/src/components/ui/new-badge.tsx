import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

export function NewBadge({ children, className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex h-4 w-8 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold leading-none uppercase tracking-wider text-primary-foreground shadow-sm',
        className,
      )}
      {...props}
    >
      <span className="relative -top-px">{children}</span>
    </span>
  );
}
