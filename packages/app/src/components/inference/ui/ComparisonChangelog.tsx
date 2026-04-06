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
import { HARDWARE_CONFIG } from '@/lib/constants';
import { getDisplayLabel, updateRepoUrl } from '@/lib/utils';

interface ComparisonChangelogProps {
  changelogs: ComparisonChangelogType[];
  selectedGPUs: string[];
  selectedPrecisions: string[];
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
            precSet.has(precision) && selectedGPUs.some((gpu) => configKeyMatchesHwKey(key, gpu))
          );
        }),
      ),
    }));

    // Ensure pinned dates are always present
    for (const date of pinnedDates) {
      if (!mapped.some((item) => item.date === date)) {
        mapped.push({ date, entries: [] });
      }
    }

    return mapped
      .filter((item) => item.entries.length > 0 || pinnedDates.has(item.date))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [changelogs, selectedGPUs, selectedPrecisions, pinnedDates]);

  const datesOnChart = useMemo(() => {
    const set = new Set(selectedDates);
    if (selectedDateRange.startDate) set.add(selectedDateRange.startDate);
    if (selectedDateRange.endDate) set.add(selectedDateRange.endDate);
    return set;
  }, [selectedDates, selectedDateRange]);

  const addableDates = useMemo(
    () => filteredChangelogs.map((c) => c.date).filter((d) => !datesOnChart.has(d)),
    [filteredChangelogs, datesOnChart],
  );

  const handleToggle = () => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    track('inference_comparison_changelog_toggled', { expanded: newState });
  };

  const label =
    filteredChangelogs.length > 0
      ? `Config Changelog (${filteredChangelogs.length} date${filteredChangelogs.length !== 1 ? 's' : ''} with changes)`
      : loading
        ? 'Config Changelog (loading...)'
        : `Config Changelog (${totalDatesQueried} date${totalDatesQueried !== 1 ? 's' : ''} queried — no matching changelog data)`;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden transition-all">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-2 hover:bg-muted/50 transition-colors rounded px-1 -mx-1"
          aria-expanded={isExpanded}
        >
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {isExpanded && addableDates.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onAddAllDates(addableDates);
              track('inference_changelog_add_all_dates', { count: addableDates.length });
            }}
            className="text-xs font-medium text-brand hover:text-brand/80 transition-colors flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Add all to chart
          </button>
        )}
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isExpanded ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pt-2 pb-4 flex flex-col gap-3">
          {filteredChangelogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No config changelog data matching the selected GPUs and precisions for this date
              range. Changelog tracking began Dec 30, 2025.
            </p>
          ) : (
            filteredChangelogs.map((item) => (
              <div key={item.date} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{item.date}</span>
                  {item.entries.length > 0 && (
                    <>
                      <span className="text-muted-foreground">&mdash;</span>
                      {item.headRef && (
                        <a
                          href={`https://github.com/SemiAnalysisAI/InferenceX/commit/${item.headRef}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm hover:underline text-foreground underline"
                        >
                          Git Commit
                          <ExternalLinkIcon />
                        </a>
                      )}
                      {item.runUrl && (
                        <a
                          href={updateRepoUrl(item.runUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm hover:underline text-foreground underline"
                        >
                          Workflow Run
                          <ExternalLinkIcon />
                        </a>
                      )}
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
                        <Minus className="h-3 w-3" />
                        Remove from chart
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <Lock className="h-3 w-3" />
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
                      <Plus className="h-3 w-3" />
                      Add to chart
                    </button>
                  )}
                </div>
                {item.entries.length > 0 ? (
                  item.entries.map((entry, entryIndex) => (
                    <div key={entryIndex} className="text-sm text-muted-foreground pl-5">
                      {selectedGPUs.length > 1 &&
                        (() => {
                          const matchingGpus = selectedGPUs.filter((gpu) =>
                            entry.config_keys.some((key) => configKeyMatchesHwKey(key, gpu)),
                          );
                          const labels = matchingGpus.map((gpu) =>
                            HARDWARE_CONFIG[gpu] ? getDisplayLabel(HARDWARE_CONFIG[gpu]) : gpu,
                          );
                          return labels.length > 0 ? (
                            <span className="text-xs font-medium text-foreground/70">
                              {labels.join(', ')}
                            </span>
                          ) : null;
                        })()}
                      {formatChangelogDescription(entry.description)}
                    </div>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground italic pl-5">
                    {item.date === firstAvailableDate
                      ? 'First benchmark run for this configuration'
                      : item.date < '2025-12-30'
                        ? 'No changelog data (tracking began Dec 30, 2025)'
                        : filteredChangelogs.some((c) => c.date < item.date && c.entries.length > 0)
                          ? 'No config changes — same configuration as previous run'
                          : 'Initial configuration — no changelog entry recorded'}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
