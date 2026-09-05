'use client';

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';
import type { Model, Sequence } from '@/lib/data-mappings';

import { profitHistoryComparisonDates, type ProfitHistoryDateRows } from './profit-history';

/**
 * Fetch the benchmark rows behind a profit-estimator history comparison: one
 * exact-date query per comparison date, the way `useChartData` fans out the
 * `/inference` comparison. The queries share the `['benchmarks', …]` cache with
 * the inference charts, so a date already compared there costs nothing here.
 */
export function useProfitHistory(options: {
  model: Model;
  sequence: Sequence;
  selectedGPUs: readonly string[];
  dateRange: { startDate: string; endDate: string };
  /** Run date the main query already covers; never fetched twice. */
  currentRunDate: string | undefined;
  enabled?: boolean;
}): {
  comparisonDates: string[];
  rowsByDate: ProfitHistoryDateRows[];
  loading: boolean;
  error: string | null;
} {
  const { model, sequence, selectedGPUs, dateRange, currentRunDate, enabled = true } = options;

  const comparisonDates = useMemo(
    () => profitHistoryComparisonDates(selectedGPUs, dateRange, currentRunDate),
    [selectedGPUs, dateRange, currentRunDate],
  );

  const queries = useQueries({
    queries: comparisonDates.map((date) =>
      benchmarkQueryOptions(model, date, enabled, true, undefined, undefined, {
        type: 'calculator',
        sequence,
      }),
    ),
  });

  const loading = queries.some((q) => q.isLoading);
  const firstError = queries.find((q) => q.error)?.error;
  // `useQueries` returns a fresh array every render; key the memo on the
  // update timestamps so a re-render without new data keeps the same rows.
  const dataKey = queries.map((q) => q.dataUpdatedAt).join(',');

  const rowsByDate = useMemo<ProfitHistoryDateRows[]>(
    () =>
      comparisonDates.map((date, i) => ({
        date,
        rows: queries[i]?.data ?? [],
      })),
    [comparisonDates, dataKey],
  );

  return {
    comparisonDates,
    rowsByDate,
    loading,
    error: firstError ? firstError.message : null,
  };
}
