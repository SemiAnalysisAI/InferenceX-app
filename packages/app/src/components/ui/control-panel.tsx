import { type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** A named group of related controls; callers own the responsive column layout. */
export function ControlPanel({
  legend,
  className,
  children,
  ...props
}: ComponentProps<'fieldset'> & { legend: ReactNode }) {
  return (
    <fieldset
      data-slot="control-panel"
      className={cn(
        'grid min-w-0 gap-4 rounded-md border border-border/70 bg-muted/10 px-4 pb-4 pt-1',
        className,
      )}
      {...props}
    >
      <legend className="px-1 text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}
