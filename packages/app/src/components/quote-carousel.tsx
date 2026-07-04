'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { CompanyLogo, highlightBrand } from '@/components/quotes/quote-utils';

export interface CarouselQuote {
  text: string;
  name: string;
  title: string;
  org: string;
  logo?: string;
  link?: string;
}

export interface QuoteCarouselProps {
  quotes: CarouselQuote[];
  overrides?: {
    /** Override display names in the org strip */
    labels?: Record<string, string>;
  };
  /** Link to a page with all quotes */
  moreHref?: string;
  /** Auto-rotate interval in ms (default 8000) */
  intervalMs?: number;
}

interface CompanyEntry {
  org: string;
  quote: CarouselQuote;
}

// One entry per org, first quote wins; entries keep the order of the quotes array.
function buildCompanyQuotes(quotes: CarouselQuote[]): CompanyEntry[] {
  const byCompany = new Map<string, CarouselQuote[]>();
  for (const q of quotes) {
    const list = byCompany.get(q.org);
    if (list) list.push(q);
    else byCompany.set(q.org, [q]);
  }
  return [...byCompany.entries()].map(([org, pool]) => ({
    org,
    quote: pool[0],
  }));
}

// Warm a logo into the browser cache so it paints instantly when its quote
// becomes active. Called on hover/focus of an org button — i.e. only on user
// intent, so the initial page load still fetches just the visible logo.
function prefetchLogo(logo?: string) {
  if (!logo || typeof window === 'undefined') return;
  const img = new window.Image();
  img.src = `/logos/${logo}`;
}

function QuoteBlock({ quote, renderLogo }: { quote: CarouselQuote; renderLogo: boolean }) {
  return (
    <blockquote className="w-full">
      <p className="text-sm lg:text-base leading-relaxed text-muted-foreground italic">
        &ldquo;{highlightBrand(quote.text)}&rdquo;
      </p>
      <footer className="mt-3 flex items-center gap-3">
        {renderLogo ? (
          <CompanyLogo org={quote.org} logo={quote.logo} />
        ) : (
          <div aria-hidden="true" className="size-10 shrink-0" />
        )}
        <div className="h-12 w-0.5 bg-brand" />
        <div className="text-sm">
          {quote.link ? (
            <a
              href={quote.link}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-foreground hover:text-brand transition-colors group"
            >
              <span className="group-hover:underline">{quote.name}</span>
              <ExternalLinkIcon />
            </a>
          ) : (
            <span className="font-semibold text-foreground">{quote.name}</span>
          )}
          <span className="block text-muted-foreground text-xs">{quote.title}</span>
        </div>
      </footer>
    </blockquote>
  );
}

export function QuoteCarousel({
  quotes,
  overrides = {},
  moreHref,
  intervalMs = 8_000,
}: QuoteCarouselProps) {
  const { labels = {} } = overrides;

  // Keep the first render deterministic so SSR reserves the carousel's full height before hydration.
  const entries = useMemo(() => buildCompanyQuotes(quotes), [quotes]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovering = useRef(false);

  const advance = useCallback(() => {
    if (hovering.current) return;
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    setFading(true);
    fadeTimeoutRef.current = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % (entries.length || 1));
      setFading(false);
      fadeTimeoutRef.current = null;
    }, 300);
  }, [entries.length]);

  // Auto-rotate
  useEffect(() => {
    if (entries.length <= 1) return;
    timerRef.current = setInterval(advance, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [advance, entries.length, intervalMs]);

  const goTo = useCallback(
    (index: number) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      setFading(true);
      fadeTimeoutRef.current = setTimeout(() => {
        setActiveIndex(index);
        setFading(false);
        fadeTimeoutRef.current = null;
      }, 300);
      timerRef.current = setInterval(advance, intervalMs);
      track('quote_carousel_navigated', {
        toOrg: entries[index]?.org,
        fromOrg: entries[activeIndex]?.org,
      });
    },
    [advance, intervalMs, entries, activeIndex],
  );

  return (
    <div
      className="flex flex-col gap-4"
      onMouseEnter={() => {
        hovering.current = true;
      }}
      onMouseLeave={() => {
        hovering.current = false;
      }}
    >
      {/* Org name strip */}
      <div className="flex flex-wrap justify-center gap-x-6 md:gap-x-8 gap-y-2 mx-4">
        {entries.map((e, i) => (
          <button
            key={e.org}
            type="button"
            onClick={() => goTo(i)}
            onMouseEnter={() => prefetchLogo(e.quote.logo)}
            onFocus={() => prefetchLogo(e.quote.logo)}
            className={`text-xs font-semibold tracking-wide uppercase transition-colors duration-200 ${
              i === activeIndex ? 'text-foreground' : 'text-[#808488] hover:text-muted-foreground'
            }`}
          >
            {labels[e.org] ?? e.org}
          </button>
        ))}
      </div>

      {/* All quotes stacked in same grid cell — tallest sets height */}
      <div className="grid items-center">
        {entries.map((e, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={e.org}
              className={`col-start-1 row-start-1 ${
                isActive
                  ? `transition-opacity duration-300 ease-in-out ${fading ? 'opacity-0' : 'opacity-100'}`
                  : 'opacity-0 invisible pointer-events-none'
              }`}
              aria-hidden={!isActive}
            >
              <QuoteBlock quote={e.quote} renderLogo={isActive} />
            </div>
          );
        })}
      </div>

      {moreHref && (
        <div className="flex justify-end" data-testid="quote-carousel-more-row">
          <Link
            href={moreHref}
            prefetch={false}
            className="text-xs font-bold text-brand hover:underline"
            onClick={() => track('quote_carousel_see_more_clicked')}
          >
            See more supporters &rarr;
          </Link>
        </div>
      )}
    </div>
  );
}
