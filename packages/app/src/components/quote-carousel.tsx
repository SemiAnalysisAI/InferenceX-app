'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { CompanyLogo, highlightBrand } from '@/components/quotes/quote-utils';

export interface CarouselQuote {
  text: string;
  name: string;
  title: string;
  company: string;
  logo?: string;
  link?: string;
}

export interface QuoteCarouselProps {
  quotes: CarouselQuote[];
  overrides?: {
    /** Companies pinned to the front in this order; rest are shuffled after */
    order?: string[];
    /** Override display names in the company strip */
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
  company: string;
  quote: CarouselQuote;
}

function buildCompanyQuotes(quotes: CarouselQuote[], order?: string[]): CompanyEntry[] {
  const byCompany = new Map<string, CarouselQuote[]>();
  for (const q of quotes) {
    const list = byCompany.get(q.company);
    if (list) list.push(q);
    else byCompany.set(q.company, [q]);
  }
  const entries = [...byCompany.entries()].map(([company, pool]) => ({
    company,
    quote: pool[Math.floor(Math.random() * pool.length)],
  }));
  if (order?.length) {
    const orderSet = new Set(order);
    const pinned = order
      .map((c) => entries.find((e) => e.company === c))
      .filter((e): e is CompanyEntry => !!e);
    const rest = shuffleArray(entries.filter((e) => !orderSet.has(e.company)));
    return [...pinned, ...rest];
  }
  return shuffleArray(entries);
}

function QuoteBlock({ quote }: { quote: CarouselQuote }) {
  return (
    <blockquote className="w-full">
      <p className="text-sm lg:text-base leading-relaxed text-muted-foreground italic">
        &ldquo;{highlightBrand(quote.text)}&rdquo;
      </p>
      <footer className="mt-3 flex items-center gap-3">
        <CompanyLogo company={quote.company} logo={quote.logo} />
        <div className="h-12 w-0.5 bg-secondary dark:bg-primary" />
        <div className="text-sm">
          <span className="font-semibold text-foreground">{quote.name}</span>
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
  const { order, labels = {} } = overrides;

  const [entries, setEntries] = useState<CompanyEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const measureRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build shuffled company order on mount (client only)
  useEffect(() => {
    setEntries(buildCompanyQuotes(quotes, order));
  }, [quotes, order]);

  // Measure tallest quote and update on resize
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const measure = () => {
      const children = el.children;
      let max = 0;
      for (let i = 0; i < children.length; i++) {
        const h = (children[i] as HTMLElement).offsetHeight;
        if (h > max) max = h;
      }
      setMeasuredHeight(max);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [entries.length]);

  const advance = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % (entries.length || 1));
      setFading(false);
    }, 300);
  }, [entries.length]);

  // Auto-rotate
  useEffect(() => {
    if (entries.length <= 1) return;
    timerRef.current = setInterval(advance, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [advance, entries.length, intervalMs]);

  const goTo = useCallback(
    (index: number) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setFading(true);
      setTimeout(() => {
        setActiveIndex(index);
        setFading(false);
      }, 300);
      timerRef.current = setInterval(advance, intervalMs);
      track('quote_carousel_navigated');
    },
    [advance, intervalMs],
  );

  if (entries.length === 0) return null;

  const current = entries[activeIndex];

  return (
    <div className="flex flex-col gap-4">
      {/* Company logo strip */}
      <div className="flex flex-wrap items-center justify-evenly gap-x-4 gap-y-2 mx-4">
        {entries.map((e, i) => (
          <button
            key={e.company}
            type="button"
            onClick={() => goTo(i)}
            className={`text-xs font-semibold tracking-wide uppercase transition-opacity duration-200 ${
              i === activeIndex
                ? 'opacity-100 text-foreground'
                : 'opacity-40 text-muted-foreground hover:opacity-70'
            }`}
          >
            {labels[e.company] ?? e.company}
          </button>
        ))}
      </div>

      {/* Visible quote — fixed height from measurement */}
      <div className="relative" style={{ minHeight: measuredHeight || undefined }}>
        {/* Hidden measurement — same width as this container */}
        <div
          ref={measureRef}
          aria-hidden
          className="absolute inset-x-0 top-0 overflow-hidden pointer-events-none"
          style={{ visibility: 'hidden', zIndex: -1 }}
        >
          {entries.map((e) => (
            <div key={e.company}>
              <QuoteBlock quote={e.quote} />
            </div>
          ))}
        </div>
        <div
          className={`w-full transition-opacity duration-300 ease-in-out ${fading ? 'opacity-0' : 'opacity-100'}`}
        >
          <QuoteBlock quote={current.quote} />
        </div>
      </div>

      {moreHref && (
        <div className="flex justify-end">
          <a
            href={moreHref}
            className="text-xs font-bold text-secondary dark:text-primary hover:underline"
          >
            See more supporters &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
