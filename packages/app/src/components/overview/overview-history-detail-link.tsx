'use client';

import { ArrowRight } from 'lucide-react';

import { track } from '@/lib/analytics';

export function OverviewHistoryDetailLink({
  href,
  model,
  hardware,
  ariaLabel,
  children,
}: {
  href: string;
  model: string;
  hardware: string;
  ariaLabel: string;
  children: string;
}) {
  return (
    <a
      data-testid="overview-history-detail-link"
      href={href}
      aria-label={ariaLabel}
      className="group mt-0.5 inline-flex min-h-11 items-center gap-1 rounded-sm text-[11px] font-medium text-foreground underline decoration-brand/50 underline-offset-4 transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none xl:min-h-8"
      onClick={() => track('overview_history_detail_clicked', { model, hardware })}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </a>
  );
}
