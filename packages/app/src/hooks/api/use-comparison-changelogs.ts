import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchWorkflowInfo, type ChangelogRow, type WorkflowInfoResponse } from '@/lib/api';

export interface ComparisonChangelog {
  date: string;
  headRef?: string;
  runUrl?: string;
  entries: {
    config_keys: string[];
    description: string;
    pr_link: string | null;
  }[];
}

export function useComparisonChangelogs(
  selectedGPUs: string[],
  selectedDateRange: { startDate: string; endDate: string },
  availableDates: string[],
) {
  const hasGPUs = selectedGPUs.length > 0;
  const hasDateRange = Boolean(selectedDateRange.startDate) && Boolean(selectedDateRange.endDate);

  // When GPUs selected: fetch all available dates. When date range also set: limit to range.
  const datesToQuery = useMemo(() => {
    if (!hasGPUs) return [];
    if (!hasDateRange) return availableDates;
    return availableDates.filter(
      (d) => d >= selectedDateRange.startDate && d <= selectedDateRange.endDate,
    );
  }, [
    hasGPUs,
    hasDateRange,
    availableDates,
    selectedDateRange.startDate,
    selectedDateRange.endDate,
  ]);

  const queries = useQueries({
    queries: datesToQuery.map((date) => ({
      queryKey: ['workflow-info', date],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchWorkflowInfo(date, signal),
      enabled: hasGPUs,
    })),
  });

  const changelogs = useMemo(() => {
    if (!hasGPUs) return [];

    const results: ComparisonChangelog[] = [];

    for (let i = 0; i < datesToQuery.length; i++) {
      const query = queries[i];
      if (!query.data) continue;

      const data = query.data as WorkflowInfoResponse;
      if (!data.changelogs || data.changelogs.length === 0) continue;

      results.push({
        date: datesToQuery[i],
        headRef: data.changelogs.at(-1)?.head_ref,
        runUrl: data.runs.at(-1)?.html_url ?? undefined,
        entries: data.changelogs.map((c: ChangelogRow) => ({
          config_keys: c.config_keys,
          description: c.description,
          pr_link: c.pr_link,
        })),
      });
    }

    return results;
  }, [hasGPUs, datesToQuery, queries]);

  const loading = queries.some((q) => q.isLoading);

  return { changelogs, loading, totalDatesQueried: datesToQuery.length };
}
