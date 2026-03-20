'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { track } from '@/lib/analytics';

import { type Quote, QUOTES } from './quotes/quotes-data';

const COMPANY_LOGO_FILE: Record<string, string> = {
  OpenAI: 'openai.svg',
  Microsoft: 'microsoft.svg',
  'Together AI': 'together-ai.svg',
  vLLM: 'vllm.svg',
  'GPU Mode': 'gpu-mode.png',
  'PyTorch Foundation': 'pytorch.svg',
  Oracle: 'oracle.svg',
  CoreWeave: 'coreweave.svg',
  Nebius: 'nebius.svg',
  Crusoe: 'crusoe.svg',
  Supermicro: 'supermicro.svg',
  TensorWave: 'tensorwave.svg',
  Vultr: 'vultr.svg',
};

const EXCLUDED_COMPANIES = new Set(['NVIDIA', 'AMD', 'Supermicro', 'Vultr']);
const ROTATE_INTERVAL_MS = 8_000;

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Group quotes by company, pick one random quote per company, shuffle company order. */
function buildCompanyQuotes(quotes: Quote[]): { company: string; quote: Quote }[] {
  const byCompany = new Map<string, Quote[]>();
  for (const q of quotes) {
    const list = byCompany.get(q.company);
    if (list) list.push(q);
    else byCompany.set(q.company, [q]);
  }
  const entries = [...byCompany.entries()].map(([company, pool]) => ({
    company,
    quote: pool[Math.floor(Math.random() * pool.length)],
  }));
  const openai = entries.filter((e) => e.company === 'OpenAI');
  const rest = shuffleArray(entries.filter((e) => e.company !== 'OpenAI'));
  return [...openai, ...rest];
}

function CompanyLogo({ company }: { company: string }) {
  const [failed, setFailed] = useState(false);
  const file = COMPANY_LOGO_FILE[company];

  if (!file || failed) {
    return (
      <div className="h-12 shrink-0 rounded-full bg-muted flex items-center justify-center px-3">
        <span className="text-xs font-bold text-muted-foreground">{company[0]}</span>
      </div>
    );
  }

  return (
    <img
      src={`/logos/${file}`}
      alt={company}
      className="h-10 min-w-10 max-w-20 shrink-0 object-contain grayscale opacity-70 dark:invert"
      onError={() => setFailed(true)}
    />
  );
}

function QuoteBlock({ quote }: { quote: Quote }) {
  return (
    <blockquote className="w-full">
      <p className="text-sm lg:text-base leading-relaxed text-muted-foreground italic">
        &ldquo;{quote.text}&rdquo;
      </p>
      <footer className="mt-3 flex items-center gap-3">
        <CompanyLogo company={quote.company} />
        <div className="h-12 w-0.5 bg-secondary dark:bg-primary" />
        <div className="text-sm">
          <span className="font-semibold text-foreground">{quote.name}</span>
          <span className="block text-muted-foreground text-xs">{quote.title}</span>
        </div>
      </footer>
    </blockquote>
  );
}

export function QuoteCarousel() {
  const filteredQuotes = useMemo(
    () => QUOTES.filter((q) => !EXCLUDED_COMPANIES.has(q.company)),
    [],
  );

  const [entries, setEntries] = useState<{ company: string; quote: Quote }[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const measureRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build shuffled company order on mount (client only)
  useEffect(() => {
    setEntries(buildCompanyQuotes(filteredQuotes));
  }, [filteredQuotes]);

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
    timerRef.current = setInterval(advance, ROTATE_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [advance, entries.length]);

  const goTo = useCallback(
    (index: number) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setFading(true);
      setTimeout(() => {
        setActiveIndex(index);
        setFading(false);
      }, 300);
      timerRef.current = setInterval(advance, ROTATE_INTERVAL_MS);
      track('quote_carousel_navigated');
    },
    [advance],
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
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
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
            {e.company === 'Together AI' ? 'Tri Dao' : e.company}
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
      </div>
    </div>
  );
}
