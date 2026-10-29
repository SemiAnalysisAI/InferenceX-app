'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { track } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';
import type { SearchResult } from '@/lib/site-search/search-index';
import { getSiteSearchEngine, type SiteSearchStatus } from '@/lib/site-search/site-search-engine';

const STRINGS = {
  en: {
    title: 'Search InferenceX',
    description:
      'Search pages, articles, chips and models. Results improve as more pages are indexed.',
    placeholder: 'Search GPUs, models, metrics, articles…',
    indexing: (done: number, total: number) => `Indexing pages… ${done} of ${total}`,
    indexed: (total: number) => `${total} pages indexed`,
    paused: (done: number, total: number) => `${done} of ${total} pages indexed`,
    loading: 'Loading site index…',
    empty: 'Type to search. Related terms match too, so “energy” finds power and J/token pages.',
    tryLabel: 'Try',
    examples: ['MI355X vs B200', 'power efficiency', 'AgentX methodology', 'cheapest GPU DeepSeek'],
    noResults: 'No matches.',
    noResultsIndexing: 'No matches yet. Still indexing, results will appear as pages load.',
    previewBadge: 'Summary',
    previewHint: 'Full page not indexed yet',
    navigate: 'to navigate',
    open: 'to open',
    close: 'to close',
    results: 'Search results',
  },
  zh: {
    title: '搜索 InferenceX',
    description: '搜索页面、文章、芯片和模型。索引的页面越多，结果越完整。',
    placeholder: '搜索 GPU、模型、指标、文章…',
    indexing: (done: number, total: number) => `正在索引页面… ${done} / ${total}`,
    indexed: (total: number) => `已索引 ${total} 个页面`,
    paused: (done: number, total: number) => `已索引 ${done} / ${total} 个页面`,
    loading: '正在加载站点索引…',
    empty: '输入关键词开始搜索。相关术语也会匹配，例如“能耗”可以找到功耗和 J/token 相关页面。',
    tryLabel: '试试',
    examples: ['MI355X vs B200', '能效', 'AgentX methodology', 'DeepSeek 成本'],
    noResults: '没有匹配结果。',
    noResultsIndexing: '暂无匹配结果。仍在索引中，页面加载后结果会陆续出现。',
    previewBadge: '摘要',
    previewHint: '完整页面尚未索引',
    navigate: '选择',
    open: '打开',
    close: '关闭',
    results: '搜索结果',
  },
} as const;

const QUERY_TRACK_DELAY_MS = 1000;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-px font-mono text-2xs text-muted-foreground">
      {children}
    </kbd>
  );
}

export function SiteSearchDialog({
  open,
  onOpenChange,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
}) {
  const strings = STRINGS[locale];
  const pathname = usePathname() ?? '/';
  const engine = getSiteSearchEngine(locale);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SiteSearchStatus>(() => engine.status());
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => engine.subscribe(setStatus), [engine]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => engine.indexLiveDocument(pathname));
    engine.start();
    return () => {
      cancelAnimationFrame(frame);
      engine.stop();
    };
  }, [open, engine, pathname]);

  useEffect(() => {
    engine.prioritize(query);
  }, [engine, query]);

  const results: SearchResult[] = useMemo(
    () => (query.trim() ? engine.search(query, 20) : []),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- version is the index revision
    [engine, query, status.version],
  );

  useEffect(() => setActiveIndex(0), [query]);
  const selected = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const timer = setTimeout(() => {
      track('header_search_queried', { query_length: trimmed.length, results: results.length });
    }, QUERY_TRACK_DELAY_MS);
    return () => clearTimeout(timer);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const close = () => onOpenChange(false);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((selected + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((selected - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      listRef.current?.querySelector<HTMLAnchorElement>(`[data-index="${selected}"]`)?.click();
    }
  };

  let statusText: string = strings.loading;
  if (status.crawling) statusText = strings.indexing(status.indexedPages, status.totalPages);
  else if (status.indexedPages >= status.totalPages)
    statusText = strings.indexed(status.totalPages);
  else if (status.seeded) statusText = strings.paused(status.indexedPages, status.totalPages);
  const progress = status.totalPages > 0 ? status.indexedPages / status.totalPages : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="site-search-dialog"
        data-site-search-ignore
        className="top-[8vh] w-[calc(100%-1.5rem)] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 sm:top-[12vh]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).querySelector('input')?.focus();
        }}
      >
        <DialogTitle className="sr-only">{strings.title}</DialogTitle>
        <DialogDescription className="sr-only">{strings.description}</DialogDescription>

        <div className="flex items-center gap-3 border-b border-border px-4 pr-12">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden
            className="shrink-0 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.8-3.8" />
          </svg>
          <input
            data-testid="site-search-input"
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={results.length > 0 ? `${listId}-${selected}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            placeholder={strings.placeholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
        </div>

        <div className="relative h-0.5 bg-transparent" aria-hidden>
          {status.crawling && (
            <div
              className="absolute inset-y-0 left-0 bg-brand/60 transition-[width] duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          )}
        </div>

        <div className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-contain">
          {query.trim() === '' ? (
            <div className="space-y-3 px-4 py-5 text-sm text-muted-foreground">
              <p>{strings.empty}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs">{strings.tryLabel}</span>
                {strings.examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    data-testid="site-search-example"
                    className="min-h-9 rounded-full border border-border px-3 text-xs text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      setQuery(example);
                      track('header_search_example_clicked', { example });
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : results.length === 0 ? (
            <p data-testid="site-search-empty" className="px-4 py-6 text-sm text-muted-foreground">
              {status.crawling || !status.seeded ? strings.noResultsIndexing : strings.noResults}
            </p>
          ) : (
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={strings.results}
              data-testid="site-search-results"
              className="p-2"
            >
              {results.map((result, index) => (
                <li
                  key={`${result.url}-${index}`}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === selected}
                >
                  <Link
                    href={result.url}
                    prefetch={false}
                    data-index={index}
                    data-testid="site-search-result"
                    className={cn(
                      'block rounded-md px-3 py-2.5 transition-colors',
                      index === selected ? 'bg-muted' : 'hover:bg-muted/60',
                    )}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => {
                      track('header_search_result_clicked', {
                        rank: index + 1,
                        source: result.source,
                        url: result.url,
                      });
                      close();
                    }}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {result.pageTitle}
                      </span>
                      {result.section && (
                        <span className="truncate text-xs text-muted-foreground">
                          › {result.section}
                        </span>
                      )}
                      {result.source === 'seed' && (
                        <span
                          className="ml-auto shrink-0 text-2xs text-muted-foreground"
                          title={strings.previewHint}
                        >
                          {strings.previewBadge}
                        </span>
                      )}
                    </div>
                    {result.snippet.length > 0 && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {result.snippet.map((part, i) =>
                          part.hit ? (
                            <mark key={i} className="rounded-sm bg-brand/15 px-0.5 text-foreground">
                              {part.text}
                            </mark>
                          ) : (
                            <span key={i}>{part.text}</span>
                          ),
                        )}
                      </p>
                    )}
                    <p className="mt-0.5 truncate font-mono text-2xs text-muted-foreground/80">
                      {result.url}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-2xs text-muted-foreground">
          <span data-testid="site-search-status" aria-live="polite">
            {statusText}
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {strings.navigate}
            <Kbd>↵</Kbd> {strings.open}
            <Kbd>esc</Kbd> {strings.close}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
