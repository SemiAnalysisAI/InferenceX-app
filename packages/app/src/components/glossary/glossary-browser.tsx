'use client';

import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

import type { GlossaryCategory, GlossaryPreview } from '@/lib/glossary';
import { cn } from '@/lib/utils';

export type GlossaryBrowserEntry = Pick<
  GlossaryPreview,
  'slug' | 'term' | 'abbreviation' | 'category' | 'plainEnglish'
> & { searchText: string };

export interface GlossaryBrowserLabels {
  searchLabel: string;
  searchPlaceholder: string;
  clearSearch: string;
  categoryFilterLabel: string;
  letterFilterLabel: string;
  allLetters: string;
  termSingular: string;
  termPlural: string;
  clearFilters: string;
  noMatch: string;
  noResultsTitle: string;
  noResultsDescription: string;
  showAllTerms: string;
}

interface GlossaryBrowserProps {
  entries: readonly GlossaryBrowserEntry[];
  categories: readonly GlossaryCategory[];
  labels?: GlossaryBrowserLabels;
  categoryLabels?: Partial<Record<GlossaryCategory, string>>;
  groupBy?: 'initial' | 'category';
  basePath?: string;
}

const DEFAULT_LABELS: GlossaryBrowserLabels = {
  searchLabel: 'Search the AI inference glossary',
  searchPlaceholder: 'Search MTP, latency, FP4…',
  clearSearch: 'Clear glossary search',
  categoryFilterLabel: 'Filter glossary by category',
  letterFilterLabel: 'Filter by letter',
  allLetters: 'ALL',
  termSingular: 'term',
  termPlural: 'terms',
  clearFilters: 'Clear filters',
  noMatch: 'No match',
  noResultsTitle: 'No glossary terms found',
  noResultsDescription: 'Try a broader keyword or clear the active filters.',
  showAllTerms: 'Show all terms',
};

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export function GlossaryBrowser({
  entries,
  categories,
  labels = DEFAULT_LABELS,
  categoryLabels,
  groupBy = 'initial',
  basePath = '/glossary',
}: GlossaryBrowserProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [category, setCategory] = useState<GlossaryCategory | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const availableLetters = useMemo(
    () =>
      groupBy === 'initial'
        ? new Set(entries.map((entry) => entry.term[0]?.toLocaleUpperCase()))
        : new Set<string>(),
    [entries, groupBy],
  );
  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (!deferredQuery || entry.searchText.includes(deferredQuery)) &&
          (!category || entry.category === category) &&
          (!letter || entry.term.toLocaleUpperCase().startsWith(letter)),
      ),
    [category, deferredQuery, entries, letter],
  );
  const groupedEntries = useMemo(() => {
    const groups: Record<string, GlossaryBrowserEntry[]> = {};
    for (const entry of filteredEntries) {
      const group =
        groupBy === 'category' ? entry.category : (entry.term[0]?.toLocaleUpperCase() ?? '#');
      (groups[group] ??= []).push(entry);
    }
    return Object.entries(groups).toSorted(([a], [b]) =>
      groupBy === 'category'
        ? categories.indexOf(a as GlossaryCategory) - categories.indexOf(b as GlossaryCategory)
        : a.localeCompare(b),
    );
  }, [categories, filteredEntries, groupBy]);
  const hasFilters = Boolean(query || category || letter);

  const clearFilters = () => {
    setQuery('');
    setCategory(null);
    setLetter(null);
  };

  return (
    <div>
      <div className="border-y border-border/50 bg-background/30 px-4 py-5 backdrop-blur-[2px] md:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(18rem,1fr)_auto] xl:items-center">
          <label className="relative block">
            <span className="sr-only">{labels.searchLabel}</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
              className="h-12 w-full rounded-lg border border-border/70 bg-background/60 pr-11 pl-11 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-brand/60 focus:ring-2 focus:ring-brand/15"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={labels.clearSearch}
                className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </label>

          <div className="flex flex-wrap gap-2" aria-label={labels.categoryFilterLabel}>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={category === item}
                onClick={() => setCategory((current) => (current === item ? null : item))}
                className={cn(
                  'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  category === item
                    ? 'border-brand/45 bg-brand/12 text-brand'
                    : 'border-border/60 bg-background/30 text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                )}
              >
                {categoryLabels?.[item] ?? item}
              </button>
            ))}
          </div>
        </div>

        {groupBy === 'initial' && (
          <div
            className="mt-5 flex items-center gap-2 overflow-x-auto pb-1"
            aria-label={labels.letterFilterLabel}
          >
            <button
              type="button"
              aria-pressed={letter === null}
              onClick={() => setLetter(null)}
              className={cn(
                'flex h-8 min-w-10 cursor-pointer items-center justify-center rounded-md border px-2 font-mono text-xs transition-colors',
                letter === null
                  ? 'border-brand/45 bg-brand/12 text-brand'
                  : 'border-border/50 text-muted-foreground hover:text-foreground',
              )}
            >
              {labels.allLetters}
            </button>
            {LETTERS.map((item) => {
              const available = availableLetters.has(item);
              return (
                <button
                  key={item}
                  type="button"
                  disabled={!available}
                  aria-pressed={letter === item}
                  onClick={() => setLetter((current) => (current === item ? null : item))}
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md border font-mono text-xs transition-colors',
                    available ? 'cursor-pointer' : 'cursor-not-allowed opacity-25',
                    letter === item
                      ? 'border-brand/45 bg-brand/12 text-brand'
                      : 'border-border/50 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <p aria-live="polite">
            <span className="font-mono text-foreground">{filteredEntries.length}</span>{' '}
            {filteredEntries.length === 1 ? labels.termSingular : labels.termPlural}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="cursor-pointer font-medium text-brand hover:underline"
            >
              {labels.clearFilters}
            </button>
          )}
        </div>
      </div>

      {groupedEntries.length > 0 ? (
        <div className="border-t border-border/50">
          {groupedEntries.map(([groupKey, group], groupIndex) => {
            const headingId = `glossary-group-${groupIndex}`;
            const groupLabel =
              groupBy === 'category'
                ? (categoryLabels?.[groupKey as GlossaryCategory] ?? groupKey)
                : groupKey;
            return (
              <section
                key={groupKey}
                aria-labelledby={headingId}
                className={cn(
                  'grid border-b border-border/50 last:border-b-0',
                  groupBy === 'category'
                    ? 'md:grid-cols-[8rem_minmax(0,1fr)]'
                    : 'md:grid-cols-[6rem_minmax(0,1fr)]',
                )}
              >
                <div className="border-b border-border/40 bg-muted/8 px-5 py-5 md:border-r md:border-b-0 md:px-6 md:py-7">
                  <h2
                    id={headingId}
                    className={cn(
                      'font-mono font-semibold text-brand md:sticky md:top-20',
                      groupBy === 'category'
                        ? 'text-base leading-6 tracking-normal'
                        : 'text-3xl tracking-[-0.06em]',
                    )}
                  >
                    {groupLabel}
                  </h2>
                </div>
                <div className="divide-y divide-border/40">
                  {group.map((entry) => (
                    <Link
                      key={entry.slug}
                      href={`${basePath}/${entry.slug}`}
                      className="group grid gap-3 px-5 py-6 transition-colors hover:bg-brand/5 md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)_auto] md:items-start md:gap-8 md:px-8"
                    >
                      <div>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <h3 className="text-lg font-semibold tracking-tight group-hover:text-brand group-hover:underline">
                            {entry.term}
                          </h3>
                          {entry.abbreviation && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {entry.abbreviation}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[0.68rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                          {categoryLabels?.[entry.category] ?? entry.category}
                        </p>
                      </div>
                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {entry.plainEnglish}
                      </p>
                      <span
                        aria-hidden="true"
                        className="hidden pt-1 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-brand md:block"
                      >
                        →
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="border-t border-border/50 px-6 py-20 text-center">
          <p className="font-mono text-xs tracking-[0.18em] text-brand uppercase">
            {labels.noMatch}
          </p>
          <h2 className="mt-3 text-2xl font-semibold">{labels.noResultsTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{labels.noResultsDescription}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-5 cursor-pointer rounded-md border border-brand/40 bg-brand/10 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/15"
          >
            {labels.showAllTerms}
          </button>
        </div>
      )}
    </div>
  );
}
