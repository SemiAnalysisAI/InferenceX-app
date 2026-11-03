import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  type ChangelogRow,
  type RunConfigRow,
  type WorkflowChangelogDate,
  fetchWorkflowChangelogs,
} from '@/lib/api/api';

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

export function useComparisonChangelogs(
  selectedGPUs: string[],
  selectedDateRange: { startDate: string; endDate: string },
  availableDates: string[],
  benchmarkType?: 'agentic_traces',
) {
  const hasGPUs = selectedGPUs.length > 0;
  const hasDateRange = Boolean(selectedDateRange.startDate) && Boolean(selectedDateRange.endDate);

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

  const from = datesToQuery.reduce((min, d) => (d < min ? d : min), datesToQuery[0] ?? '');
  const to = datesToQuery.reduce((max, d) => (d > max ? d : max), datesToQuery[0] ?? '');

  const query = useQuery({
    queryKey: benchmarkType
      ? (['workflow-changelogs', from, to, benchmarkType] as const)
      : (['workflow-changelogs', from, to] as const),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchWorkflowChangelogs(from, to, signal, benchmarkType),
    enabled: hasGPUs && datesToQuery.length > 0,
  });
  const rangeData = query.data;

  const changelogs = useMemo(() => {
    if (!hasGPUs) return [];

    const byDate = new Map<string, WorkflowChangelogDate>(rangeData?.dates.map((d) => [d.date, d]));
    const results: ComparisonChangelog[] = [];

    for (const date of datesToQuery) {
      const data = byDate.get(date);
      if (!data) continue;
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
        date,
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
  }, [hasGPUs, datesToQuery, rangeData]);

  const loading = query.isLoading;

  return { changelogs, loading, totalDatesQueried: datesToQuery.length };
}
