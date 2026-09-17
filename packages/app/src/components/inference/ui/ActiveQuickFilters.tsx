'use client';

import { X } from 'lucide-react';
import { useInferenceActions, useInferenceFilters } from '../InferenceContext';
import { quickFilterSummary } from '../utils/quick-filter-summary';
import type { DeploymentMode, SpecMode } from '../types';
import type { PowerTier } from '@/lib/power-tier';
import { Sequence } from '@/lib/data-mappings';
import { useLocale } from '@/lib/use-locale';
import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/button';

const STRINGS = {
  en: { active: 'Active filters', clear: 'Clear quick filters', remove: 'Remove' },
  zh: { active: '当前筛选', clear: '清除快捷筛选', remove: '移除' },
} as const;

export function ActiveQuickFilters() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const { quickFilters, selectedSequence, lockedFrameworks } = useInferenceFilters();
  const actions = useInferenceActions();
  // A framework lock (embed routes) cannot be removed, so it gets no chip.
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
    else actions.setQuickFilterPower(values as PowerTier[]);
  };

  return (
    <section
      aria-label={t.active}
      data-testid="active-quick-filters"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-3"
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
            setCategory(
              category,
              quickFilters[category].filter((item) => item !== value),
            );
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
          // Clear only displayed categories: an AgentX visit must not erase a
          // fixed-sequence spec filter that does not apply to this workload.
          new Set(filters.map((filter) => filter.category)).forEach((category) =>
            setCategory(category, []),
          );
          track('inference_quick_filters_cleared', { source: 'result_summary' });
        }}
      >
        {t.clear}
      </Button>
    </section>
  );
}
