'use client';

import { ChevronDown, ChevronUp, FileText, Lock, Minus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';

import type { ComparisonChangelog as ComparisonChangelogType } from '@/hooks/api/use-comparison-changelogs';
import {
  configKeyMatchesHwKey,
  formatChangelogDescription,
} from '@/components/inference/utils/changelogFormatters';
import { makeRunComparisonEntry } from '@/components/inference/utils/comparisonEntry';
import { dataRunsForDate } from '@/components/inference/utils/runEnumeration';
import { getHardwareConfig } from '@/lib/constants';
import { getDisplayLabel, updateRepoUrl } from '@/lib/utils';

/** Git Commit and Workflow Run external links for a run, each shown when known. */
function renderRunLinks(headRef?: string, runUrl?: string) {
  return (
    <>
      {headRef && (
        <a
          href={`https://github.com/SemiAnalysisAI/InferenceX/commit/${headRef}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm hover:underline text-foreground underline"
        >
          Git Commit
          <ExternalLinkIcon />
        </a>
      )}
      {runUrl && (
        <a
          href={updateRepoUrl(runUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm hover:underline text-foreground underline"
        >
          Workflow Run
          <ExternalLinkIcon />
        </a>
      )}
    </>
  );
}

/** One changelog entry's description. The GPU and run # are shown in the entry title. */
function renderDescription(
  entry: { config_keys: string[]; description: string },
  key: number | string,
) {
  return (
    <div key={key} className="text-sm text-muted-foreground pl-5">
      {formatChangelogDescription(entry.description)}
    </div>
  );
}

interface ComparisonChangelogProps {
  changelogs: ComparisonChangelogType[];
  selectedGPUs: string[];
  selectedPrecisions: string[];
  /**
   * DB model keys for the currently selected model (e.g. ['dsv4']). Changelog
   * config keys are `<model>-<precision>-<gpu>-<framework>` and a GPU+framework
   * like `b200-vllm` is shared across models, so without this filter the run list
   * would offer other models' runs — which then plot nothing (the data fetch is
   * model-scoped).
   */
  modelDbKeys: string[];
  loading?: boolean;
  totalDatesQueried: number;
  selectedDates: string[];
  selectedDateRange: { startDate: string; endDate: string };
  onAddDate: (date: string) => void;
  onRemoveDate: (date: string) => void;
  onAddAllDates: (dates: string[]) => void;
  /** Earliest date the selected GPU config has benchmark data */
  firstAvailableDate?: string;
}

export default function ComparisonChangelog({
  changelogs,
  selectedGPUs,
  selectedPrecisions,
  modelDbKeys,
  loading,
  totalDatesQueried,
  selectedDates,
  selectedDateRange,
  onAddDate,
  onRemoveDate,
  onAddAllDates,
  firstAvailableDate,
}: ComparisonChangelogProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Filter changelog entries to only show those matching selected GPUs and precisions.
  // Always keep range endpoints and first appearance date visible.
  const pinnedDates = useMemo(() => {
    const set = new Set<string>();
    if (selectedDateRange.startDate) set.add(selectedDateRange.startDate);
    if (selectedDateRange.endDate) set.add(selectedDateRange.endDate);
    if (firstAvailableDate) set.add(firstAvailableDate);
    return set;
  }, [selectedDateRange, firstAvailableDate]);

  const filteredChangelogs = useMemo(() => {
    const precSet = new Set(selectedPrecisions);

    const mapped = changelogs.map((item) => ({
      ...item,
      entries: item.entries.filter((entry) =>
        entry.config_keys.some((key) => {
          const precision = key.split('-')[1];
          return (
            modelDbKeys.some((m) => key.startsWith(`${m}-`)) &&
            precSet.has(precision) &&
            selectedGPUs.some((gpu) => configKeyMatchesHwKey(key, gpu))
          );
        }),
      ),
    }));

    // Ensure pinned dates are always present
    for (const date of pinnedDates) {
      if (!mapped.some((item) => item.date === date)) {
        mapped.push({ date, entries: [], runs: [], runConfigs: [] });
      }
    }

    return mapped
      .filter((item) => item.entries.length > 0 || pinnedDates.has(item.date))
      .toSorted((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [changelogs, modelDbKeys, selectedGPUs, selectedPrecisions, pinnedDates]);

  const datesOnChart = useMemo(() => {
    const set = new Set(selectedDates);
    if (selectedDateRange.startDate) set.add(selectedDateRange.startDate);
    if (selectedDateRange.endDate) set.add(selectedDateRange.endDate);
    return set;
  }, [selectedDates, selectedDateRange]);

  // True when a changelog entry touches one of the selected GPU configs at a
  // selected precision — the same predicate used to filter the date list, reused
  // to attach changelog notes to the runs that are worth offering as series.
  const entryMatchesSelection = useMemo(() => {
    const precSet = new Set(selectedPrecisions);
    return (configKeys: string[]): boolean =>
      configKeys.some((key) => {
        const precision = key.split('-')[1];
        return (
          modelDbKeys.some((m) => key.startsWith(`${m}-`)) &&
          precSet.has(precision) &&
          selectedGPUs.some((gpu) => configKeyMatchesHwKey(key, gpu))
        );
      });
  }, [modelDbKeys, selectedPrecisions, selectedGPUs]);

  /**
   * Every run that produced data for the selected config on a date, earliest
   * first, with its changelog notes (if any) attached. Data-driven so a run that
   * shipped data without a changelog entry still appears as its own series.
   */
  const runMetaFor = useMemo(
    () => (item: (typeof filteredChangelogs)[number]) => {
      const clByRun = new Map(item.runs.map((r) => [r.runId, r]));
      return dataRunsForDate(item.runConfigs, {
        modelDbKeys,
        selectedGPUs,
        selectedPrecisions,
      }).map((run) => {
        const cl = clByRun.get(run.runId);
        return {
          runId: run.runId,
          headRef: cl?.headRef ?? run.headSha,
          runUrl: cl?.runUrl ?? run.runUrl,
          entries: (cl?.entries ?? []).filter((e) => entryMatchesSelection(e.config_keys)),
        };
      });
    },
    [modelDbKeys, selectedGPUs, selectedPrecisions, entryMatchesSelection],
  );

  // Entries the "Add all to chart" button would add: every run not yet on the
  // chart (run-level for multi-run dates, the plain date for single-run dates).
  const addableEntries = useMemo(() => {
    const out: string[] = [];
    for (const item of filteredChangelogs) {
      const runs = runMetaFor(item);
      if (runs.length > 1) {
        for (const run of runs) {
          const entry = makeRunComparisonEntry(item.date, run.runId);
          if (!selectedDates.includes(entry)) out.push(entry);
        }
      } else if (!datesOnChart.has(item.date)) {
        out.push(item.date);
      }
    }
    return out;
  }, [filteredChangelogs, runMetaFor, selectedDates, datesOnChart]);

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    track('inference_comparison_changelog_toggled', { expanded: newState });
  };

  /** Display labels of the selected GPUs that a set of changelog entries touches. */
  const gpuLabelsFor = (entries: { config_keys: string[] }[]): string => {
    if (selectedGPUs.length <= 1) return '';
    return selectedGPUs
      .filter((gpu) =>
        entries.some((e) => e.config_keys.some((k) => configKeyMatchesHwKey(k, gpu))),
      )
      .map((gpu) => getDisplayLabel(getHardwareConfig(gpu)))
      .join(', ');
  };

  const label =
    filteredChangelogs.length > 0
      ? `Config Changelog (${filteredChangelogs.length} date${filteredChangelogs.length === 1 ? '' : 's'} with changes)`
      : loading
        ? 'Config Changelog (loading...)'
        : `Config Changelog (${totalDatesQueried} date${totalDatesQueried === 1 ? '' : 's'} queried — no matching changelog data)`;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden transition-all">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <button
          type="button"
          onClick={handleToggle}
          className="flex flex-1 items-center justify-between gap-2 hover:bg-muted/50 transition-colors rounded px-1 -mx-1"
          aria-expanded={isExpanded}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium truncate">{label}</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {isExpanded && addableEntries.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onAddAllDates(addableEntries);
              track('inference_changelog_add_all_dates', { count: addableEntries.length });
            }}
            className="text-xs font-medium text-brand hover:text-brand/80 transition-colors flex items-center gap-1"
          >
            <Plus className="size-3" />
            Add all to chart
          </button>
        )}
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isExpanded ? 'max-h-1000 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pt-2 pb-4 flex flex-col gap-3">
          {filteredChangelogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No config changelog data matching the selected GPUs and precisions for this date
              range. Changelog tracking began Dec 30, 2025.
            </p>
          ) : (
            filteredChangelogs.map((item) => {
              const runs = runMetaFor(item);

              // Multiple runs produced data for the selected config on this date →
              // render each run as its own first-class entry (its own #, changelog,
              // and add/remove). Includes runs with no changelog notes so the newest
              // run is never dropped just because it lacked an entry.
              if (runs.length > 1) {
                return runs.map((run, idx) => {
                  const entry = makeRunComparisonEntry(item.date, run.runId);
                  const onChart = selectedDates.includes(entry);
                  const gpuLabel = gpuLabelsFor(run.entries);
                  return (
                    <div key={entry} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">
                          {item.date}
                          {gpuLabel ? ` ${gpuLabel}` : ''} #{idx + 1}
                        </span>
                        <span className="text-muted-foreground">&mdash;</span>
                        {renderRunLinks(run.headRef, run.runUrl)}
                        {onChart ? (
                          <button
                            type="button"
                            onClick={() => {
                              onRemoveDate(entry);
                              track('inference_changelog_remove_run', {
                                date: item.date,
                                run: run.runId,
                              });
                            }}
                            className="text-xs font-medium text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5"
                          >
                            <Minus className="size-3" />
                            Remove from chart
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              onAddDate(entry);
                              track('inference_changelog_add_run', {
                                date: item.date,
                                run: run.runId,
                              });
                            }}
                            className="text-xs font-medium text-brand hover:text-brand/80 transition-colors flex items-center gap-0.5"
                          >
                            <Plus className="size-3" />
                            Add to chart
                          </button>
                        )}
                      </div>
                      {run.entries.length > 0 ? (
                        run.entries.map((e, i) => renderDescription(e, i))
                      ) : (
                        <span className="text-sm text-muted-foreground italic pl-5">
                          No changelog notes for this run
                        </span>
                      )}
                    </div>
                  );
                });
              }

              // Single (or no) matching run → one block keyed by the date. Link to
              // the run that produced this config's data so a date with unrelated
              // same-day runs never borrows another run's commit/run links. No
              // matching run (e.g. a pinned endpoint) → no links.
              const { headRef, runUrl } = runs[0] ?? {};
              const dateGpuLabel = gpuLabelsFor(item.entries);
              return (
                <div key={item.date} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">
                      {item.date}
                      {dateGpuLabel ? ` ${dateGpuLabel}` : ''}
                    </span>
                    {item.entries.length > 0 && (headRef || runUrl) && (
                      <>
                        <span className="text-muted-foreground">&mdash;</span>
                        {renderRunLinks(headRef, runUrl)}
                      </>
                    )}
                    {datesOnChart.has(item.date) ? (
                      selectedDates.includes(item.date) ? (
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveDate(item.date);
                            track('inference_changelog_remove_date', { date: item.date });
                          }}
                          className="text-xs font-medium text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5"
                        >
                          <Minus className="size-3" />
                          Remove from chart
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Lock className="size-3" />
                          On chart
                        </span>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onAddDate(item.date);
                          track('inference_changelog_add_date', { date: item.date });
                        }}
                        className="text-xs font-medium text-brand hover:text-brand/80 transition-colors flex items-center gap-0.5"
                      >
                        <Plus className="size-3" />
                        Add to chart
                      </button>
                    )}
                  </div>
                  {item.entries.length > 0 ? (
                    item.entries.map((entry, entryIndex) => renderDescription(entry, entryIndex))
                  ) : (
                    <span className="text-sm text-muted-foreground italic pl-5">
                      {item.date === firstAvailableDate
                        ? 'First benchmark run for this configuration'
                        : item.date < '2025-12-30'
                          ? 'No changelog data (tracking began Dec 30, 2025)'
                          : filteredChangelogs.some(
                                (c) => c.date < item.date && c.entries.length > 0,
                              )
                            ? 'No config changes — same configuration as previous run'
                            : 'Initial configuration — no changelog entry recorded'}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
