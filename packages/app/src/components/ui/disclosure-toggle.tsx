'use client';

import { ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/shared/utils';

export function DisclosureToggle({
  open,
  hanging = false,
  className,
  children,
  ...props
}: Omit<ComponentProps<'button'>, 'type' | 'aria-expanded'> & {
  open: boolean;
  hanging?: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-foreground max-md:after:absolute',
        hanging
          ? 'mr-1 size-6 justify-center max-md:after:-inset-2.5 in-data-[slot=card]:-mr-1 in-data-[slot=card]:-ml-5 md:in-data-[slot=card]:mr-0 md:in-data-[slot=card]:-ml-6'
          : 'max-md:after:inset-x-0 max-md:after:-inset-y-3.5',
        className,
      )}
      {...props}
    >
      <ChevronRight
        aria-hidden="true"
        className={cn(
          'shrink-0 transition-transform duration-200',
          hanging ? 'size-4' : 'size-3.5',
          open && 'rotate-90',
        )}
      />
      {children}
    </button>
  );
}
