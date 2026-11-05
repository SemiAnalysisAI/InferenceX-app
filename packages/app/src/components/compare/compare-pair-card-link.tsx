'use client';

import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics/analytics';

import { HwVendorLogo } from '@/components/ui/hw-vendor-logo';

let lastTaggedTitle: HTMLElement | null = null;

function tagSharedElementForNavigation(title: HTMLElement | null) {
  if (
    title &&
    typeof document.startViewTransition === 'function' &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  ) {
    if (lastTaggedTitle && lastTaggedTitle !== title) {
      lastTaggedTitle.style.viewTransitionName = '';
    }
    lastTaggedTitle = title;
    title.style.viewTransitionName = 'compare-title';
  }
}

interface PairHardware {
  label: string;
  vendor?: string;
}

interface ComparePairCardLinkProps {
  href: string;
  slug: string;
  label: string;
  archLine: string;
  locale?: 'en' | 'zh';
  scenarioLabel?: 'AgentX' | '8K/1K';
  hardwareA?: PairHardware;
  hardwareB?: PairHardware;
}

export function ComparePairCardLink({
  href,
  slug,
  label,
  archLine,
  locale = 'en',
  scenarioLabel,
  hardwareA,
  hardwareB,
}: ComparePairCardLinkProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return (
    <a
      href={href}
      data-scenario={scenarioLabel}
      data-pending={pending || undefined}
      aria-busy={pending || undefined}
      className="motion-nav-pending group relative flex flex-col rounded-xl border border-border bg-background/20 p-5 backdrop-blur-[2px] transition-[border-color,background-color,box-shadow,opacity] duration-200 hover:border-brand/50 hover:bg-brand/3 hover:shadow-lg hover:shadow-brand/5 focus-visible:outline-none"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        track('compare_index_pair_clicked', {
          slug,
          label,
          ...(scenarioLabel ? { scenario: scenarioLabel } : {}),
        });
        setPending(true);
        tagSharedElementForNavigation(titleRef.current);
        window.location.href = href;
      }}
    >
      <div className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand/60 transition-all duration-200 group-hover:bg-brand group-hover:inset-y-2" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              ref={titleRef}
              className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-semibold text-sm leading-tight group-hover:text-brand transition-colors duration-200"
            >
              {hardwareA && hardwareB ? (
                <>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <HwVendorLogo vendor={hardwareA.vendor} />
                    {hardwareA.label}
                  </span>{' '}
                  <span className="font-normal text-muted-foreground">
                    {locale === 'zh' ? '与' : 'vs'}
                  </span>{' '}
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <HwVendorLogo vendor={hardwareB.vendor} />
                    {hardwareB.label}
                  </span>
                </>
              ) : (
                label
              )}
            </h3>
            {scenarioLabel && (
              <span className="inline-flex min-h-5 items-center rounded-full border border-brand/30 bg-brand/10 px-2 font-mono text-3xs font-semibold leading-none text-brand">
                {scenarioLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{archLine}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
    </a>
  );
}
