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
    description: 'Search pages, articles, chips and models.',
    placeholder: 'Search GPUs, models, metrics, articles…',
    loading: 'Loading site index…',
    loadingLive: 'Loading site index… this page is searchable now',
    ready: (pages: number, summaries: number, built: string) =>
      summaries > 0
        ? `${pages} pages indexed · ${summaries} summary only · built ${built}`
        : `${pages} pages indexed · built ${built}`,
    unavailable: 'Site index unavailable',
    unavailableLive: 'Site index unavailable · searching this page only',
    empty: 'Type to search. Related terms match too, so “energy” finds power and J/token pages.',
    tryLabel: 'Try',
    examples: ['MI355X vs B200', 'power efficiency', 'AgentX methodology', 'cheapest GPU DeepSeek'],
    noResults: 'No matches.',
    noResultsLoading: 'No matches on this page. The site index is still loading.',
    noResultsUnavailable: 'No matches on this page. The site index could not be loaded.',
    previewBadge: 'Summary',
    previewHint: 'Only the page title and description are indexed',
    navigate: 'to navigate',
    open: 'to open',
    close: 'to close',
    results: 'Search results',
  },
  zh: {
    title: '搜索 InferenceX',
    description: '搜索页面、文章、芯片和模型。',
    placeholder: '搜索 GPU、模型、指标、文章…',
    loading: '正在加载站点索引…',
    loadingLive: '正在加载站点索引… 当前页面已可搜索',
    ready: (pages: number, summaries: number, built: string) =>
      summaries > 0
        ? `已索引 ${pages} 个页面 · ${summaries} 个仅摘要 · 构建于 ${built}`
        : `已索引 ${pages} 个页面 · 构建于 ${built}`,
    unavailable: '站点索引不可用',
    unavailableLive: '站点索引不可用 · 仅搜索当前页面',
    empty: '输入关键词开始搜索。相关术语也会匹配，例如“能耗”可以找到功耗和 J/token 相关页面。',
    tryLabel: '试试',
    examples: ['MI355X vs B200', '能效', 'AgentX methodology', 'DeepSeek 成本'],
    noResults: '没有匹配结果。',
    noResultsLoading: '当前页面没有匹配结果。站点索引仍在加载。',
    noResultsUnavailable: '当前页面没有匹配结果。站点索引无法加载。',
    previewBadge: '摘要',
    previewHint: '仅索引了页面标题和简介',
    navigate: '选择',
    open: '打开',
    close: '关闭',
    results: '搜索结果',
  },
} as const;

const QUERY_TRACK_DELAY_MS = 1000;

/** Status line: what is searchable right now, never a promise of more to come. */
export function describeStatus(status: SiteSearchStatus, locale: Locale): string {
  const strings = STRINGS[locale];
  if (status.state === 'ready') {
    const built = status.generatedAt
      ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(new Date(status.generatedAt))
      : '';
    return strings.ready(status.pages, status.summaryPages, built);
  }
  if (status.state === 'unavailable') {
    return status.liveIndexed ? strings.unavailableLive : strings.unavailable;
  }
  return status.liveIndexed ? strings.loadingLive : strings.loading;
}

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

  // Index the page on screen, then load the build-time site index (once per
  // tab; a failed load retries on the next open).
  useEffect(() => {
    if (!open) return;
    // Wait a frame so the dialog portal exists and is excluded from extraction.
    const frame = requestAnimationFrame(() => engine.indexLiveDocument(pathname));
    void engine.load();
    return () => cancelAnimationFrame(frame);
  }, [open, engine, pathname]);

  // `status.version` changes whenever the live page or the site index lands,
  // so results refresh without retyping.
  const results: SearchResult[] = useMemo(
    () => (query.trim() ? engine.search(query, 20) : []),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- version is the index revision
    [engine, query, status.version],
  );

  useEffect(() => setActiveIndex(0), [query]);
  // An index update can shrink the list under the cursor; clamp so the highlight and
  // Enter always target a real row.
  const selected = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const timer = setTimeout(() => {
      track('header_search_queried', { query: trimmed.slice(0, 100), results: results.length });
    }, QUERY_TRACK_DELAY_MS);
    return () => clearTimeout(timer);
    // Track settled queries only, not every index revision.
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

  const statusText = describeStatus(status, locale);
  const loading = status.state === 'idle' || status.state === 'loading';

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
          {loading && <div className="absolute inset-0 animate-pulse bg-brand/40" />}
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
              {loading
                ? strings.noResultsLoading
                : status.state === 'unavailable'
                  ? strings.noResultsUnavailable
                  : strings.noResults}
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
                      {/* The page title keeps priority over a long section heading. */}
                      <span className="max-w-[70%] shrink-0 truncate text-sm font-medium text-foreground">
                        {result.pageTitle}
                      </span>
                      {result.section && (
                        <span className="min-w-0 truncate text-xs text-muted-foreground">
                          › {result.section}
                        </span>
                      )}
                      {result.source === 'summary' && (
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
          <span data-testid="site-search-status" data-state={status.state} aria-live="polite">
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
