'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Quote } from 'lucide-react';

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
    /** Companies pinned to the front in this order; rest are shuffled after */
    order?: string[];
    /** Override display names in the org strip */
    labels?: Record<string, string>;
  };
  /** Link to a page with all quotes */
  moreHref?: string;
  /** Auto-rotate interval in ms (default 8000) */
  intervalMs?: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface CompanyEntry {
  org: string;
  quote: CarouselQuote;
}

function buildCompanyQuotes(quotes: CarouselQuote[], order?: string[]): CompanyEntry[] {
  const byCompany = new Map<string, CarouselQuote[]>();
  for (const q of quotes) {
    const list = byCompany.get(q.org);
    if (list) list.push(q);
    else byCompany.set(q.org, [q]);
  }
  const entries = [...byCompany.entries()].map(([org, pool]) => ({
    org,
    quote: pool[Math.floor(Math.random() * pool.length)],
  }));
  if (order?.length) {
    const orderSet = new Set(order);
    const pinned = order
      .map((c) => entries.find((e) => e.org === c))
      .filter(Boolean) as CompanyEntry[];
    const rest = shuffleArray(entries.filter((e) => !orderSet.has(e.org)));
    return [...pinned, ...rest];
  }
  return shuffleArray(entries);
}

function QuoteText({ quote }: { quote: CarouselQuote }) {
  return (
    <blockquote className="m-0 p-0 border-0">
      <p className="text-sm lg:text-base leading-relaxed text-muted-foreground">
        <Quote className="inline-block mr-2 -mt-1 size-4 text-brand align-middle" aria-hidden="true" />
        {highlightBrand(quote.text)}
      </p>
    </blockquote>
  );
}

function QuoteAuthor({ quote }: { quote: CarouselQuote }) {
  return (
    <div className="flex items-center gap-3">
      <CompanyLogo org={quote.org} logo={quote.logo} />
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
    </div>
  );
}

export function QuoteCarousel({
  quotes,
  overrides = {},
  moreHref,
  intervalMs = 8_000,
}: QuoteCarouselProps) {
  const { order, labels = {} } = overrides;

  const [entries, setEntries] = useState<CompanyEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovering = useRef(false);

  // Build shuffled org order on mount (client only)
  useEffect(() => {
    setEntries(buildCompanyQuotes(quotes, order));
  }, [quotes, order]);

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

  if (entries.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-5"
      onMouseEnter={() => {
        hovering.current = true;
      }}
      onMouseLeave={() => {
        hovering.current = false;
      }}
    >
      {/* Org logo strip — infinite marquee carousel; clickable, active is highlighted.
          Each set carries `pr-5` so the trailing gap is baked into the 50%
          translate, keeping the loop seamless. */}
      <div className="overflow-hidden">
        <div className="flex w-max animate-marquee">
          {[0, 1].map((copy) => (
            <div
              key={copy}
              className="flex items-center gap-x-5 pr-5 shrink-0"
              aria-hidden={copy === 1 ? true : undefined}
            >
              {entries.map((e, i) => {
                const isActive = i === activeIndex;
                return (
                  <button
                    key={e.org}
                    type="button"
                    onClick={() => goTo(i)}
                    title={labels[e.org] ?? e.org}
                    aria-label={`Show quote from ${labels[e.org] ?? e.org}`}
                    tabIndex={copy === 1 ? -1 : undefined}
                    className={`group flex h-10 shrink-0 items-center justify-center px-2 rounded-md transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                      isActive
                        ? 'bg-accent/60'
                        : 'opacity-50 hover:opacity-100'
                    }`}
                  >
                    {e.quote.logo ? (
                      <img
                        src={`/logos/${e.quote.logo}`}
                        alt={labels[e.org] ?? e.org}
                        className={`h-6 sm:h-7 max-w-[110px] object-contain transition-all duration-200 ${
                          isActive ? 'grayscale-0 dark:invert' : 'grayscale dark:invert'
                        }`}
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className={`text-xs font-semibold tracking-wide uppercase ${
                          isActive ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {labels[e.org] ?? e.org}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Stacked quote texts — tallest sets the cell height. */}
      <div className="grid items-start">
        {entries.map((e, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={e.org}
              className={`col-start-1 row-start-1 ${
                isActive
                  ? `transition-opacity duration-300 ease-in-out ${
                      fading ? 'opacity-0' : 'opacity-100'
                    }`
                  : 'opacity-0 invisible pointer-events-none'
              }`}
              aria-hidden={!isActive}
            >
              <QuoteText quote={e.quote} />
            </div>
          );
        })}
      </div>

      {/* Bottom row: active quote's author (left) and "See more" link (right),
          aligned to the same bottom baseline via items-end. */}
      <div className="flex items-end justify-between gap-4">
        <div className="grid items-end flex-1 min-w-0">
          {entries.map((e, i) => {
            const isActive = i === activeIndex;
            return (
              <div
                key={e.org}
                className={`col-start-1 row-start-1 ${
                  isActive
                    ? `transition-opacity duration-300 ease-in-out ${
                        fading ? 'opacity-0' : 'opacity-100'
                      }`
                    : 'opacity-0 invisible pointer-events-none'
                }`}
                aria-hidden={!isActive}
              >
                <QuoteAuthor quote={e.quote} />
              </div>
            );
          })}
        </div>
        {moreHref && (
          <Link
            href={moreHref}
            className="text-xs font-bold text-brand hover:underline shrink-0"
            onClick={() => track('quote_carousel_see_more_clicked')}
          >
            See more supporters &rarr;
          </Link>
        )}
      </div>
    </div>
  );
}
