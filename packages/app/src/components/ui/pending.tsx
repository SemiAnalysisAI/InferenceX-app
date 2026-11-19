import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/shared/utils';

export function Pending({
  active,
  label = 'Loading…',
  className,
  children,
}: {
  active: boolean;
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div aria-busy={active} className={cn('relative', className)}>
      {active && (
        <div role="status" className="sticky top-16 z-20 flex h-0 justify-center overflow-visible">
          <span className="mt-4 flex h-9 items-center gap-2 rounded-lg border border-border/30 bg-card px-4 text-sm text-muted-foreground shadow-sm">
            <Loader2 className="size-4 animate-spin" />
            {label}
          </span>
        </div>
      )}
      <div className={cn('transition-opacity', active && 'pointer-events-none opacity-40')}>
        {children}
      </div>
    </div>
  );
}
