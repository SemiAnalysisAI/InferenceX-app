import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { type ChangelogRow, type RunConfigRow, type WorkflowInfoResponse } from '@/lib/api/api';
import { workflowInfoQueryOptions } from '@/hooks/api/use-workflow-info';

export interface ComparisonChangelogEntry {
  config_keys: string[];
  description: string;
  pr_link: string | null;
}

export interface ComparisonRun {
  runId: string;
  headRef?: string;
  runUrl?: string;
  entries: ComparisonChangelogEntry[];
}

export interface ComparisonChangelog {
  date: string;
  entries: ComparisonChangelogEntry[];
  runs: ComparisonRun[];
  runConfigs: RunConfigRow[];
}

/**
 * Without a date range the changelog requests `/api/v1/workflow-info` once per
 * available date (about a hundred requests). An embedded dashboard shows the
 * changelog collapsed, so it waits until the reader opens it, or until a date
 * comparison needs per-date run configs.
 */
export function shouldFetchComparisonChangelogs({
  embedded,
  changelogOpened,
  selectedDateRange,
  selectedDates,
}: {
  embedded: boolean;
  changelogOpened: boolean;
  selectedDateRange: { startDate: string; endDate: string };
  selectedDates: readonly string[];
}): boolean {
  return (
    !embedded ||
    changelogOpened ||
    (Boolean(selectedDateRange.startDate) && Boolean(selectedDateRange.endDate)) ||
    selectedDates.length > 0
  );
}

export function useComparisonChangelogs(
  selectedGPUs: string[],
  selectedDateRange: { startDate: string; endDate: string },
  availableDates: string[],
  benchmarkType?: 'agentic_traces',
  enabled = true,
) {
  const hasGPUs = selectedGPUs.length > 0;
  const hasDateRange = Boolean(selectedDateRange.startDate) && Boolean(selectedDateRange.endDate);

  const datesToQuery = useMemo(() => {
    if (!hasGPUs || !enabled) return [];
    if (!hasDateRange) return availableDates;
    return availableDates.filter(
      (d) => d >= selectedDateRange.startDate && d <= selectedDateRange.endDate,
    );
  }, [
    hasGPUs,
    enabled,
    hasDateRange,
    availableDates,
    selectedDateRange.startDate,
    selectedDateRange.endDate,
  ]);

  const queries = useQueries({
    queries: datesToQuery.map((date) => workflowInfoQueryOptions(date, benchmarkType, hasGPUs)),
  });

  const changelogs = useMemo(() => {
    if (!hasGPUs) return [];

    const results: ComparisonChangelog[] = [];

    for (let i = 0; i < datesToQuery.length; i++) {
      const query = queries[i];
      if (!query.data) continue;

      const data = query.data as WorkflowInfoResponse;
      if (!data.changelogs || data.changelogs.length === 0) continue;

      const entriesByRun = new Map<number, ChangelogRow[]>();
      for (const c of data.changelogs) {
        const list = entriesByRun.get(c.workflow_run_id) ?? [];
        list.push(c);
        entriesByRun.set(c.workflow_run_id, list);
      }

      const orderedRuns = [...data.runs].toSorted((a, b) =>
        a.created_at.localeCompare(b.created_at),
      );
      const runs: ComparisonRun[] = orderedRuns
        .map((run) => {
          const runEntries = entriesByRun.get(run.github_run_id) ?? [];
          return {
            runId: String(run.github_run_id),
            headRef: runEntries.at(-1)?.head_ref,
            runUrl: run.html_url ?? undefined,
            entries: runEntries.map((c) => ({
              config_keys: c.config_keys,
              description: c.description,
              pr_link: c.pr_link,
            })),
          };
        })
        .filter((r) => r.entries.length > 0);

      results.push({
        date: datesToQuery[i],
        entries: data.changelogs.map((c: ChangelogRow) => ({
          config_keys: c.config_keys,
          description: c.description,
          pr_link: c.pr_link,
        })),
        runs,
        runConfigs: data.runConfigs ?? [],
      });
    }

    return results;
  }, [hasGPUs, datesToQuery, queries]);

  const loading = queries.some((q) => q.isLoading);

  return { changelogs, loading, totalDatesQueried: datesToQuery.length };
}
