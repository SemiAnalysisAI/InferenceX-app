'use client';

import { X } from 'lucide-react';
import { useInferenceActions, useInferenceFilters } from '../InferenceContext';
import { quickFilterSummary } from '../utils/quick-filter-summary';
import type { DeploymentMode, SpecMode } from '../types';
import type { PowerTier } from '@/lib/power/power-tier';
import { Sequence } from '@/lib/catalog/data-mappings';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { Button } from '@/components/ui/button';

const STRINGS = {
  en: {
    active: 'Active filters',
    clear: 'Clear quick filters',
    clearShort: 'Clear',
    remove: 'Remove',
  },
  zh: { active: '当前筛选', clear: '清除快捷筛选', clearShort: '清除', remove: '移除' },
} as const;

/**
 * The active quick filters as removable chips. `compact` is the PowerX ranking's row under
 * its Filter button: small chips and a plain Clear, no heading.
 */
export function ActiveQuickFilters({ compact = false }: { compact?: boolean } = {}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { quickFilters, selectedSequence, lockedFrameworks } = useInferenceFilters();
  const actions = useInferenceActions();
  const filters = quickFilterSummary(
    quickFilters,
    locale,
    selectedSequence === Sequence.AgenticTraces,
  ).filter((filter) => !(lockedFrameworks && filter.category === 'frameworks'));
  if (filters.length === 0) return null;

  const setCategory = (category: (typeof filters)[number]['category'], values: string[]) => {
    if (category === 'vendors') actions.setQuickFilterVendors(values);
    else if (category === 'frameworks') actions.setQuickFilterFrameworks(values);
    else if (category === 'deployment')
      actions.setQuickFilterDeployment(values as DeploymentMode[]);
    else if (category === 'spec') actions.setQuickFilterSpec(values as SpecMode[]);
    else if (category === 'topologies') actions.setQuickFilterTopologies(values);
    else actions.setQuickFilterPower(values as PowerTier[]);
  };

  const removeFilter = (category: (typeof filters)[number]['category'], value: string) =>
    setCategory(
      category,
      (quickFilters[category] ?? []).filter((item) => item !== value),
    );
  const clearAll = () =>
    new Set(filters.map((filter) => filter.category)).forEach((category) =>
      setCategory(category, []),
    );

  if (compact) {
    return (
      <section
        aria-label={t.active}
        data-testid="active-quick-filters"
        className="flex flex-wrap items-center gap-1 border-b border-border py-2"
      >
        {filters.map(({ category, value, categoryLabel, label }) => (
          <span
            key={`${category}:${value}`}
            className="inline-flex h-6 max-w-full items-center gap-1 rounded-full pr-1 pl-2 text-xs shadow-[inset_0_0_0_1px_var(--border)]"
          >
            <span className="min-w-0 truncate" title={`${categoryLabel}: ${label}`}>
              {label}
            </span>
            <button
              type="button"
              className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              data-testid={`remove-filter-${category}-${value}`}
              aria-label={`${t.remove} ${categoryLabel}: ${label}`}
              onClick={() => {
                removeFilter(category, value);
                track('powerx_filter_removed', { category, value });
              }}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="inline-flex h-6 cursor-pointer items-center rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          data-testid="clear-active-quick-filters"
          onClick={() => {
            clearAll();
            track('powerx_filters_cleared', { count: filters.length });
          }}
        >
          {t.clearShort}
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label={t.active}
      data-testid="active-quick-filters"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-xs font-medium text-muted-foreground">{t.active}</span>
      {filters.map(({ category, value, categoryLabel, label }) => (
        <Button
          key={`${category}:${value}`}
          type="button"
          variant="outline"
          size="sm"
          className="h-auto min-h-11 max-w-full gap-1.5 whitespace-normal text-left md:min-h-8"
          data-testid={`remove-filter-${category}-${value}`}
          aria-label={`${t.remove} ${categoryLabel}: ${label}`}
          onClick={() => {
            removeFilter(category, value);
            track('inference_quick_filter_removed', { category, value, source: 'result_summary' });
          }}
        >
          <span>
            <span className="text-muted-foreground">{categoryLabel}: </span>
            {label}
          </span>
          <X className="size-3.5 shrink-0" aria-hidden="true" />
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        data-testid="clear-active-quick-filters"
        onClick={() => {
          clearAll();
          track('inference_quick_filters_cleared', { source: 'result_summary' });
        }}
      >
        {t.clear}
      </Button>
    </section>
  );
}
