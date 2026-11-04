'use client';

import React, { useMemo, type ReactNode } from 'react';

import { summarizeModelHistory } from '@/lib/benchmarks/model-history-summary';
import { useLocale } from '@/lib/i18n/use-locale';
import { useGlobalFilterAvailability } from '@/providers/GlobalFilterContext';

const STRINGS = {
  en: {
    spanDays: (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`,
    historyTitle: (days: number, first: string, last: string) =>
      `${days} benchmark days from ${first} to ${last}`,
  },
  zh: {
    spanDays: (days: number) => `${days} 天`,
    historyTitle: (days: number, first: string, last: string) =>
      `${first} 至 ${last}，共 ${days} 个基准测试日`,
  },
} as const;

/**
 * Details for each model's row in the Historical model dropdown: how many days its benchmark
 * history spans and which hardware vendors have benchmarked it, to find the longest histories.
 */
export function useModelHistoryDetails(): ReadonlyMap<string, ReactNode> | undefined {
  const t = STRINGS[useLocale()];
  const { availabilityRows, availableModels } = useGlobalFilterAvailability();
  return useMemo(() => {
    if (!availabilityRows) return undefined;
    const summaries = summarizeModelHistory(availabilityRows, availableModels);
    return new Map(
      [...summaries].map(([model, summary]) => [
        model,
        <span
          key={model}
          className="ml-auto flex shrink-0 items-center gap-4 pl-4 text-xs text-muted-foreground tabular-nums"
          title={
            summary.firstDate && summary.lastDate
              ? t.historyTitle(summary.snapshotDays, summary.firstDate, summary.lastDate)
              : undefined
          }
        >
          <span className="w-16 text-right">{t.spanDays(summary.spanDays)}</span>
          <span className="hidden w-40 truncate sm:block">{summary.vendors.join(' · ')}</span>
        </span>,
      ]),
    );
  }, [availabilityRows, availableModels, t]);
}
