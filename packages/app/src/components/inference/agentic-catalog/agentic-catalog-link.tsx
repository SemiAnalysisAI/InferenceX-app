'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { track } from '@/lib/analytics/analytics';

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
      className="group flex flex-col rounded-xl border border-border/30 bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h4 className="text-sm font-medium leading-tight">{label}</h4>
            <span className="font-mono text-2xs leading-none text-muted-foreground">
              {precisionLabel}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{archLine}</p>
          <p className="mt-1 font-mono text-2xs leading-relaxed text-muted-foreground">
            {detailLine}
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
    </AgenticCatalogLink>
  );
}
