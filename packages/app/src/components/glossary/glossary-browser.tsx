'use client';

import Link from 'next/link';
import { ArrowRight, Search, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

import { tagChipClass } from '@/components/blog/blog-tag-chip';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { track } from '@/lib/analytics/analytics';
import { useSearchTracking } from '@/lib/analytics/use-search-tracking';
import type { GlossaryCategory, GlossaryPreview } from '@/lib/content/glossary';
import { cn } from '@/lib/shared/utils';

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
  allLetters: 'All',
  termSingular: 'term',
  termPlural: 'terms',
  clearFilters: 'Clear filters',
  noResultsTitle: 'No glossary terms found',
  noResultsDescription: 'Try a broader keyword or clear the active filters',
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
  useSearchTracking('glossary_searched', query, { results: filteredEntries.length });

  const clearFilters = (placement: 'toolbar' | 'empty_state') => {
    track('glossary_filters_cleared', { placement });
    setQuery('');
    setCategory(null);
    setLetter(null);
  };
  const toggleCategory = (item: GlossaryCategory) => {
    track('glossary_category_toggled', { category: item, enabled: category !== item });
    setCategory((current) => (current === item ? null : item));
  };
  const toggleLetter = (item: string) => {
    track('glossary_letter_toggled', { letter: item, enabled: letter !== item });
    setLetter((current) => (current === item ? null : item));
  };

  return (
    <div>
      <div className="border-b border-border/30 px-4 py-5 md:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(18rem,1fr)_auto] xl:items-center">
          <label className="relative block">
            <span className="sr-only">{labels.searchLabel}</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
              className="pr-10 pl-9 md:h-8"
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon-2xs"
                onClick={() => {
                  track('glossary_search_cleared');
                  setQuery('');
                }}
                aria-label={labels.clearSearch}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            )}
          </label>

          <div className="flex flex-wrap gap-2" aria-label={labels.categoryFilterLabel}>
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={category === item}
                onClick={() => toggleCategory(item)}
                className={cn(tagChipClass(category === item), 'cursor-pointer')}
              >
                {categoryLabels?.[item] ?? item}
              </button>
            ))}
          </div>
        </div>

        {groupBy === 'initial' && (
          <div
            className="mt-4 flex items-center gap-1 overflow-x-auto pb-1"
            aria-label={labels.letterFilterLabel}
          >
            <button
              type="button"
              aria-pressed={letter === null}
              onClick={() => {
                if (letter !== null) track('glossary_letter_cleared');
                setLetter(null);
              }}
              className={cn(
                'flex h-8 min-w-10 cursor-pointer items-center justify-center rounded-md px-2 text-xs font-medium transition-colors',
                letter === null
                  ? 'bg-brand/10 text-brand'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
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
                  onClick={() => toggleLetter(item)}
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-medium transition-colors',
                    available ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                    letter === item
                      ? 'bg-brand/10 text-brand'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  )}
                >
                  {item}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3 text-xs text-muted-foreground md:px-6">
        <p aria-live="polite">
          <span className="font-medium text-foreground tabular-nums">{filteredEntries.length}</span>{' '}
          {filteredEntries.length === 1 ? labels.termSingular : labels.termPlural}
        </p>
        {hasFilters && (
          <button
            type="button"
            onClick={() => clearFilters('toolbar')}
            className="cursor-pointer font-medium text-foreground hover:underline"
          >
            {labels.clearFilters}
          </button>
        )}
      </div>

      {groupedEntries.length > 0 ? (
        <div className="border-t border-border/30">
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
                  'grid border-b border-border/30 last:border-b-0',
                  groupBy === 'category'
                    ? 'md:grid-cols-[8rem_minmax(0,1fr)]'
                    : 'md:grid-cols-[5rem_minmax(0,1fr)]',
                )}
              >
                <div className="px-4 pt-5 md:px-6 md:py-6">
                  <h2
                    id={headingId}
                    className={cn(
                      'font-medium md:sticky md:top-20',
                      groupBy === 'category'
                        ? 'text-sm leading-6 text-foreground'
                        : 'text-2xl text-muted-foreground',
                    )}
                  >
                    {groupLabel}
                  </h2>
                </div>
                <div className="divide-y divide-border/20">
                  {group.map((entry) => (
                    <Link
                      key={entry.slug}
                      href={`${basePath}/${entry.slug}`}
                      className="group grid gap-2 px-4 py-5 transition-colors hover:bg-muted/40 focus-visible:outline-none md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)_auto] md:items-start md:gap-8 md:px-6"
                    >
                      <div>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <h3 className="text-base font-medium group-hover:text-brand">
                            {entry.term}
                          </h3>
                          {entry.abbreviation && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {entry.abbreviation}
                            </span>
                          )}
                        </div>
                        {groupBy === 'initial' && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {categoryLabels?.[entry.category] ?? entry.category}
                          </p>
                        )}
                      </div>
                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                        {entry.plainEnglish}
                      </p>
                      <ArrowRight
                        aria-hidden="true"
                        className="mt-1 hidden size-4 text-muted-foreground transition-colors group-hover:text-foreground md:block"
                      />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState
          bare
          title={labels.noResultsTitle}
          titleAs="h2"
          action={
            <Button type="button" variant="outline" onClick={() => clearFilters('empty_state')}>
              {labels.showAllTerms}
            </Button>
          }
          className="border-t border-border/30 px-6 py-16"
        >
          {labels.noResultsDescription}
        </EmptyState>
      )}
    </div>
  );
}
