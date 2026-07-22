'use client';

import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { OverviewConfigResult, OverviewModelSummary } from '@/lib/overview-data';
import { buildOverviewDashboardHref } from '@/lib/overview-links';

/**
 * Model-level dashboard link. A plain anchor for the same reason the evidence
 * links below are: the dashboard reads its filters from a snapshot `url-state.ts`
 * takes at module evaluation, so a client-side `<Link>` navigation would land on
 * an unfiltered dashboard while the label promises the model's own view.
 */
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

const EVIDENCE_LINK_CLASS =
  'group inline-flex min-h-11 w-fit items-center gap-1 whitespace-nowrap rounded-sm text-xs text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none';

/**
 * One evidence link: the /inference dashboard pre-filtered to a ranked
 * configuration. The visible text stays short so the compact rows scan; the
 * full deployment topology rides in `ariaLabel`, which the caller also makes
 * distinct per cohort — so no two evidence links share the accessible name
 * "Open filtered dashboard".
 *
 * A plain anchor, not a `<Link>`: the dashboard reads its share-link params
 * from a snapshot `url-state.ts` takes at module evaluation, so a client-side
 * navigation would arrive with every filter dropped — silently unfiltered while
 * the accessible name promises filtered evidence.
 */
export function OverviewDashboardLink({
  locale,
  model,
  config,
  ariaLabel,
  children,
}: {
  locale: 'en' | 'zh';
  model: OverviewModelSummary;
  config: OverviewConfigResult;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <a
      href={buildOverviewDashboardHref(locale, model, config)}
      aria-label={ariaLabel}
      className={EVIDENCE_LINK_CLASS}
    >
      {children}
    </a>
  );
}
