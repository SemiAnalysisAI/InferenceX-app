import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

export function NewBadge({ children, className, ...props }: ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      className={cn(
        // 32x16 pill. `NEW` inks ~23px at 10px bold, so the horizontal room is
        // slack rather than padding to spend: `min-w-8` holds the shared size
        // for short labels (zh `新`) while letting an unusually wide label
        // widen the pill instead of spilling its glyphs past the edge.
        'inline-flex h-4 min-w-8 shrink-0 items-center justify-center rounded-full bg-brand px-0.5 text-[10px] font-bold leading-none uppercase tracking-normal text-primary-foreground shadow-sm',
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
