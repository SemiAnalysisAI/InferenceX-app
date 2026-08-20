'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { track } from '@/lib/analytics';

/**
 * Analytics-instrumented links for the `/inference/agentic` catalog. The page
 * and its cards are server components, so every tracked click routes here —
 * the same arrangement `compare-index-tracked-link.tsx` uses for `/compare`.
 */
interface AgenticCatalogLinkProps extends Omit<React.ComponentProps<typeof Link>, 'href'> {
  href: string;
  analyticsEvent: 'agentic_catalog_tutorial_clicked' | 'agentic_catalog_point_clicked';
  analyticsTarget?: string;
}

export function AgenticCatalogLink({
  href,
  analyticsEvent,
  analyticsTarget,
  onClick,
  ...props
}: AgenticCatalogLinkProps) {
  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        track(analyticsEvent, analyticsTarget ? { target: analyticsTarget } : undefined);
      }}
    />
  );
}

export interface AgenticCatalogCardStrings {
  /** "{n} points · conc {min}–{max}" summary line. */
  points: (count: number) => string;
  concurrency: (min: number, max: number) => string;
}

export function AgenticCatalogCardLink({
  href,
  label,
  archLine,
  precisionLabel,
  detailLine,
  target,
}: {
  href: string;
  label: string;
  archLine: string;
  precisionLabel: string;
  detailLine: string;
  target: string;
}) {
  return (
    <AgenticCatalogLink
      href={href}
      analyticsEvent="agentic_catalog_point_clicked"
      analyticsTarget={target}
      data-testid={`agentic-catalog-card-${target}`}
      className="group relative flex flex-col rounded-xl border border-border bg-background/20 p-5 backdrop-blur-[2px] transition-all duration-200 hover:scale-[1.01] hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5"
    >
      <div className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand/60 transition-all duration-200 group-hover:inset-y-2 group-hover:bg-brand" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold leading-tight transition-colors duration-200 group-hover:text-brand">
              {label}
            </h4>
            <span className="inline-flex min-h-5 items-center rounded-full border border-brand/30 bg-brand/10 px-2 font-mono text-[10px] font-semibold leading-none text-brand">
              {precisionLabel}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{archLine}</p>
          <p className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {detailLine}
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
    </AgenticCatalogLink>
  );
}
