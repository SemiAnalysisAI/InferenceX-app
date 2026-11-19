'use client';

import { ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/shared/utils';

export function DisclosureToggle({
  open,
  className,
  children,
  ...props
}: Omit<ComponentProps<'button'>, 'type' | 'aria-expanded'> & {
  open: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-foreground max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3.5',
        className,
      )}
      {...props}
    >
      <ChevronRight
        aria-hidden="true"
        className={cn('size-3.5 shrink-0 transition-transform duration-200', open && 'rotate-90')}
      />
      {children}
    </button>
  );
}
