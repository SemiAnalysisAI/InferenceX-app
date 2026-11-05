'use client';

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { buildComparisonDates } from '@/components/inference/hooks/useChartData';
import { parseComparisonEntry } from '@/components/inference/utils/comparisonEntry';
import { benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';
import type { Model, Sequence } from '@/lib/catalog/data-mappings';

import { dropCurrentRunEntries, type ProfitHistoryDateRows } from './profit-history';

const EMPTY_RUN_IDS: Readonly<Record<string, string>> = {};

export function useProfitHistory(options: {
  model: Model;
  sequence: Sequence;
  selectedGPUs: readonly string[];
  selectedDates: readonly string[];
  dateRange: { startDate: string; endDate: string };
  currentRunDate: string | undefined;
  currentRunIds?: Readonly<Record<string, string>>;
  enabled?: boolean;
  includePower?: boolean;
}): {
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
    currentRunIds = EMPTY_RUN_IDS,
    enabled = true,
    includePower = false,
  } = options;

  const comparisonDates = useMemo(
    () =>
      dropCurrentRunEntries(
        buildComparisonDates([...selectedGPUs], [...selectedDates], dateRange, currentRunDate),
        selectedGPUs,
        currentRunIds,
      ),
    [selectedGPUs, selectedDates, dateRange, currentRunDate, currentRunIds],
  );

  const view = useMemo(
    () => (includePower ? undefined : { type: 'calculator' as const, sequence }),
    [sequence, includePower],
  );

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
