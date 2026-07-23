'use client';

import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

/** A plain anchor, not `<Link>`: the dashboard reads filters from a snapshot
 *  `url-state.ts` takes at module evaluation, so client-side navigation would
 *  land unfiltered. */
export function OverviewDetailLink({
  href,
  model,
  ariaLabel,
  className,
  children,
}: {
  href: string;
  model: string;
  ariaLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={ariaLabel}
      className={cn(
        'group inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-sm font-medium text-foreground underline decoration-brand/50 underline-offset-4 transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none',
        className,
      )}
      onClick={() => track('overview_model_detail_clicked', { model })}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </a>
  );
}
