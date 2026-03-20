'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';

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

function CompanyLogo({ quote }: { quote: CarouselQuote }) {
  const [failed, setFailed] = useState(false);

  if (!quote.logo || failed) {
    return (
      <div className="h-12 shrink-0 rounded-full bg-muted flex items-center justify-center px-3">
        <span className="text-xs font-bold text-muted-foreground">{quote.company[0]}</span>
      </div>
    );
  }

  return (
    <img
      src={`/logos/${quote.logo}`}
      alt={quote.company}
      className="h-10 min-w-10 max-w-20 shrink-0 object-contain grayscale opacity-70 dark:invert"
      onError={() => setFailed(true)}
    />
  );
}

function highlightBrand(text: string) {
  const parts = text.split(/(InferenceMAX™?|InferenceX™?|InferenceMAX|InferenceX)/gi);
  return parts.map((part, i) =>
    /^inference(max|x)/i.test(part) ? (
      <span key={i} className="text-secondary dark:text-primary font-semibold">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function QuoteBlock({ quote }: { quote: CarouselQuote }) {
  return (
    <blockquote className="w-full">
      <p className="text-sm lg:text-base leading-relaxed text-muted-foreground italic">
        &ldquo;{highlightBrand(quote.text)}&rdquo;
      </p>
      <footer className="mt-3 flex items-center gap-3">
        <CompanyLogo quote={quote} />
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
      {/* Hidden measurement container — renders all quotes to find tallest */}
      <div
        ref={measureRef}
        aria-hidden
        className="absolute left-0 right-0 overflow-hidden pointer-events-none"
        style={{ visibility: 'hidden', position: 'absolute', zIndex: -1 }}
      >
        {entries.map((e) => (
          <div key={e.company}>
            <QuoteBlock quote={e.quote} />
          </div>
        ))}
      </div>

      {/* Company logo strip — same shuffled order as cycling */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 mx-4">
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
      <div className="relative flex items-start" style={{ minHeight: measuredHeight || undefined }}>
        <div
          className={`w-full transition-opacity duration-300 ease-in-out ${fading ? 'opacity-0' : 'opacity-100'}`}
        >
          <QuoteBlock quote={current.quote} />
        </div>
        {moreHref && (
          <a
            href={moreHref}
            className="absolute right-0 bottom-0 text-xs font-bold text-secondary dark:text-primary hover:underline transition-opacity"
          >
            See more supporters &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
