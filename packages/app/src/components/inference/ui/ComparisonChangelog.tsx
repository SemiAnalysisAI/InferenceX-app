'use client';

import { Check, ChevronDown, ChevronUp, FileText, Lock, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';

import type { ComparisonChangelog as ComparisonChangelogType } from '@/hooks/api/use-comparison-changelogs';
import {
  configKeyMatchesHwKey,
  formatChangelogDescription,
} from '@/components/inference/utils/changelogFormatters';
import { updateRepoUrl } from '@/lib/utils';

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
}: ComparisonChangelogProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Filter changelog entries to only show those matching selected GPUs and precisions.
  // Always keep range endpoints visible even if they have no matching entries.
  const filteredChangelogs = useMemo(() => {
    const precSet = new Set(selectedPrecisions);
    const rangeEndpoints = new Set<string>();
    if (selectedDateRange.startDate) rangeEndpoints.add(selectedDateRange.startDate);
    if (selectedDateRange.endDate) rangeEndpoints.add(selectedDateRange.endDate);

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

    // Ensure range endpoints are always present
    for (const endpoint of rangeEndpoints) {
      if (!mapped.some((item) => item.date === endpoint)) {
        mapped.push({ date: endpoint, entries: [] });
      }
    }

    return mapped
      .filter((item) => item.entries.length > 0 || rangeEndpoints.has(item.date))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [changelogs, selectedGPUs, selectedPrecisions, selectedDateRange]);

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
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
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
                        <Check className="h-3 w-3" />
                        On chart
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
                      className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5"
                    >
                      <Plus className="h-3 w-3" />
                      Add to chart
                    </button>
                  )}
                  {item.entries.length > 0 ? (
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
                  ) : (
                    <span className="text-sm text-muted-foreground italic">
                      {item.date < '2025-12-30'
                        ? 'No changelog data (tracking began Dec 30, 2025)'
                        : 'No config changes recorded'}
                    </span>
                  )}
                </div>
                {item.entries.map((entry, entryIndex) => (
                  <div key={entryIndex} className="text-sm text-muted-foreground pl-5">
                    {formatChangelogDescription(entry.description)}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
