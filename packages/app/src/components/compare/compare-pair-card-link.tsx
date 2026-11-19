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
  archLine?: string;
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
      className="motion-nav-pending group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-[background-color,opacity] hover:bg-muted/60 focus-visible:outline-none"
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
      <div className="min-w-0 flex-1">
        <h3
          ref={titleRef}
          className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium leading-tight"
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
        {(archLine || scenarioLabel) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {[archLine, scenarioLabel].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </a>
  );
}
