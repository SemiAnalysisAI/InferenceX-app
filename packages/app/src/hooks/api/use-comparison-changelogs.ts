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
  const isComparisonMode =
    selectedGPUs.length > 0 && !!selectedDateRange.startDate && !!selectedDateRange.endDate;

  // Query all available dates within the selected range to discover which have changelog entries
  const datesInRange = useMemo(() => {
    if (!isComparisonMode) return [];
    return availableDates.filter(
      (d) => d >= selectedDateRange.startDate && d <= selectedDateRange.endDate,
    );
  }, [isComparisonMode, availableDates, selectedDateRange.startDate, selectedDateRange.endDate]);

  const queries = useQueries({
    queries: datesInRange.map((date) => ({
      queryKey: ['workflow-info', date],
      queryFn: () => fetchWorkflowInfo(date),
      enabled: isComparisonMode,
    })),
  });

  const changelogs = useMemo(() => {
    if (!isComparisonMode) return [];

    const results: ComparisonChangelog[] = [];

    for (let i = 0; i < datesInRange.length; i++) {
      const query = queries[i];
      if (!query.data) continue;

      const data = query.data as WorkflowInfoResponse;
      if (!data.changelogs || data.changelogs.length === 0) continue;

      // Include all changelogs for this date (across all runs)
      results.push({
        date: datesInRange[i],
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
  }, [isComparisonMode, datesInRange, queries]);

  // Intermediate dates with any changelog entries (excluding start/end)
  const intermediateDates = useMemo(() => {
    if (!isComparisonMode) return [];
    return changelogs
      .filter((c) => c.date !== selectedDateRange.startDate && c.date !== selectedDateRange.endDate)
      .map((c) => c.date)
      .sort();
  }, [isComparisonMode, changelogs, selectedDateRange.startDate, selectedDateRange.endDate]);

  const loading = queries.some((q) => q.isLoading);

  return { changelogs, intermediateDates, loading, totalDatesQueried: datesInRange.length };
}
