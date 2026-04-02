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
  const hasDateRange = !!selectedDateRange.startDate && !!selectedDateRange.endDate;

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
      queryFn: () => fetchWorkflowInfo(date),
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
        headRef: data.changelogs[data.changelogs.length - 1]?.head_ref,
        runUrl: data.runs[data.runs.length - 1]?.html_url ?? undefined,
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
