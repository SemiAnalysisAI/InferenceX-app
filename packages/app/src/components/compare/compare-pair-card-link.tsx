'use client';

import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';

import { HwVendorLogo } from '@/components/ui/hw-vendor-logo';

/**
 * Marks the clicked card's title as the outgoing half of the `compare-title`
 * shared-element view transition (the detail <h1> carries the incoming half
 * via the static `vt-compare-title` class).
 *
 * This must be imperative and happen inside the click handler:
 * - `view-transition-name` values must be unique per document, so the name
 *   can only ever be on one card — the clicked one, known only at click time.
 * - The browser snapshots the old page synchronously when the navigation
 *   starts, so a React state update would not commit in time; the style has
 *   to be set on the DOM node before `location.href` is assigned.
 * - The inline style bypasses the reduced-motion media query that gates
 *   `.vt-compare-title` in motion.css, hence the explicit matchMedia check.
 */
let lastTaggedTitle: HTMLElement | null = null;

function tagSharedElementForNavigation(title: HTMLElement | null) {
  if (
    title &&
    typeof document.startViewTransition === 'function' &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  ) {
    // A bfcache restore (Back) revives the document with the previously
    // clicked card still tagged — its name deliberately survives the restore
    // so the reverse h1→card morph can pair with it. But the name must be
    // unique per document, so before tagging a *different* card, untag the
    // survivor or the browser skips the transition entirely.
    if (lastTaggedTitle && lastTaggedTitle !== title) {
      lastTaggedTitle.style.viewTransitionName = '';
    }
    lastTaggedTitle = title;
    title.style.viewTransitionName = 'compare-title';
  }
}

/** One side of the "A vs B" pair: display label plus vendor for the logo. */
interface PairHardware {
  label: string;
  vendor?: string;
}

interface ComparePairCardLinkProps {
  href: string;
  slug: string;
  label: string;
  archLine: string;
  scenarioLabel?: 'AgentX' | '8K→1K';
  /** When both sides are provided, the title renders each hardware label with
   *  its vendor logo beside it instead of the plain `label` string. */
  hardwareA?: PairHardware;
  hardwareB?: PairHardware;
}

export function ComparePairCardLink({
  href,
  slug,
  label,
  archLine,
  scenarioLabel,
  hardwareA,
  hardwareB,
}: ComparePairCardLinkProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState(false);

  // A bfcache restore (Back from the detail page) revives the frozen JS heap,
  // pending state included — without this the card stays dimmed/aria-busy
  // forever. pageshow with `persisted` is the only signal for that path.
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
        // Intentionally a full-document navigation (pre-existing behavior).
        // `data-pending` dims the card so the click visibly registered.
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
              className="font-semibold text-sm leading-tight group-hover:text-brand transition-colors duration-200"
            >
              {hardwareA && hardwareB ? (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <HwVendorLogo vendor={hardwareA.vendor} />
                    {hardwareA.label}
                  </span>{' '}
                  <span className="font-normal text-muted-foreground">vs</span>{' '}
                  <span className="inline-flex items-center gap-1.5">
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
