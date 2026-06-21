import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  fetchWorkflowInfo,
  type ChangelogRow,
  type RunConfigRow,
  type WorkflowInfoResponse,
} from '@/lib/api';

export interface ComparisonChangelogEntry {
  config_keys: string[];
  description: string;
  pr_link: string | null;
}

/** One workflow run on a date, with its own changelog entries. */
export interface ComparisonRun {
  /** GitHub run id (string). */
  runId: string;
  headRef?: string;
  runUrl?: string;
  /** Changelog entries attributed to this specific run. */
  entries: ComparisonChangelogEntry[];
}

export interface ComparisonChangelog {
  date: string;
  /** All of the date's changelog entries (flattened across runs). */
  entries: ComparisonChangelogEntry[];
  /** Individual runs on this date, in chronological order (earliest first). */
  runs: ComparisonRun[];
  /**
   * Per-(run, config) coverage from the benchmark data itself. Used to enumerate
   * every run that produced data on this date — including runs without a changelog
   * entry, which `runs` omits. The comparison UI keys run series off this so the
   * newest run never silently vanishes just because it lacked changelog notes.
   */
  runConfigs: RunConfigRow[];
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

      // Group changelog entries by the run that produced them. In the API
      // response, changelog.workflow_run_id is the GitHub run id (see
      // getChangelogByDate's `wr.github_run_id as workflow_run_id`).
      const entriesByRun = new Map<number, ChangelogRow[]>();
      for (const c of data.changelogs) {
        const list = entriesByRun.get(c.workflow_run_id) ?? [];
        list.push(c);
        entriesByRun.set(c.workflow_run_id, list);
      }

      // Order runs chronologically (earliest first) so the #1/#2/#3 indices the
      // UI assigns read in the order the runs actually happened.
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
