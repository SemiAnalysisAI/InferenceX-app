'use client';

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { buildComparisonDates } from '@/components/inference/hooks/useChartData';
import { parseComparisonEntry } from '@/components/inference/utils/comparisonEntry';
import { benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';
import type { Model, Sequence } from '@/lib/data-mappings';

import type { ProfitHistoryDateRows } from './profit-history';

/**
 * Fetch the benchmark rows behind a profit-estimator history comparison, the
 * way `useChartData` fans out the `/inference` comparison: the entries to
 * compare are the range endpoints plus every date or run pinned from the
 * Config Changelog (`buildComparisonDates`), a plain date becomes one
 * exact-date query, and a `date~r<runId>` entry becomes one exact-run query.
 * The queries share the `['benchmarks', …]` cache with the inference charts, so
 * a date already compared there costs nothing here.
 */
export function useProfitHistory(options: {
  model: Model;
  sequence: Sequence;
  selectedGPUs: readonly string[];
  /** Comparison entries pinned from the changelog (`i_dates`). */
  selectedDates: readonly string[];
  dateRange: { startDate: string; endDate: string };
  /** Run date the main query already covers; never fetched twice. */
  currentRunDate: string | undefined;
  enabled?: boolean;
}): {
  /** Comparison entries in fetch order (dates or `date~r<runId>` runs). */
  comparisonDates: string[];
  rowsByDate: ProfitHistoryDateRows[];
  loading: boolean;
  error: string | null;
} {
  const {
    model,
    sequence,
    selectedGPUs,
    selectedDates,
    dateRange,
    currentRunDate,
    enabled = true,
  } = options;

  const comparisonDates = useMemo(
    () => buildComparisonDates([...selectedGPUs], [...selectedDates], dateRange, currentRunDate),
    [selectedGPUs, selectedDates, dateRange, currentRunDate],
  );

  const view = useMemo(() => ({ type: 'calculator' as const, sequence }), [sequence]);

  const queries = useQueries({
    queries: comparisonDates.map((entry) => {
      const { runId } = parseComparisonEntry(entry);
      return runId
        ? benchmarkQueryOptions(model, '', enabled, false, runId, true, view)
        : benchmarkQueryOptions(model, entry, enabled, true, undefined, undefined, view);
    }),
  });

  const loading = queries.some((q) => q.isLoading);
  const firstError = queries.find((q) => q.error)?.error;
  // `useQueries` returns a fresh array every render; key the memo on the
  // update timestamps so a re-render without new data keeps the same rows.
  const dataKey = queries.map((q) => q.dataUpdatedAt).join(',');

  const rowsByDate = useMemo<ProfitHistoryDateRows[]>(
    () =>
      comparisonDates.map((entry, i) => ({
        date: entry,
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
