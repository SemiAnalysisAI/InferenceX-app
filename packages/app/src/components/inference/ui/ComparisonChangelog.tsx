'use client';

import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
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
}

export default function ComparisonChangelog({
  changelogs,
  selectedGPUs,
  selectedPrecisions,
  loading,
  totalDatesQueried,
}: ComparisonChangelogProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter changelog entries to only show those matching selected GPUs and precisions.
  // For GPUs without a direct entry on a date, walk backwards to the most recent prior changelog.
  const filteredChangelogs = useMemo(() => {
    const precSet = new Set(selectedPrecisions);
    const sorted = [...changelogs].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const matchesGpu = (key: string) => {
      const precision = key.split('-')[1];
      return precSet.has(precision) && selectedGPUs.some((gpu) => configKeyMatchesHwKey(key, gpu));
    };

    return sorted
      .map((item) => {
        // Direct entries matching selected GPUs/precisions
        const directEntries = item.entries.filter((entry) => entry.config_keys.some(matchesGpu));

        // Find GPUs that have direct entries on this date
        const coveredGPUs = new Set<string>();
        for (const entry of directEntries) {
          for (const key of entry.config_keys) {
            if (!matchesGpu(key)) continue;
            for (const gpu of selectedGPUs) {
              if (configKeyMatchesHwKey(key, gpu)) coveredGPUs.add(gpu);
            }
          }
        }

        // For uncovered GPUs, walk backwards through earlier dates
        const inheritedEntries: {
          config_keys: string[];
          description: string;
          pr_link: string | null;
          inheritedFromDate: string;
        }[] = [];

        for (const gpu of selectedGPUs) {
          if (coveredGPUs.has(gpu)) continue;
          // Walk backwards through sorted changelogs before this date
          for (let i = sorted.indexOf(item) - 1; i >= 0; i--) {
            const prior = sorted[i];
            const match = prior.entries.find((entry) =>
              entry.config_keys.some((key) => matchesGpu(key) && configKeyMatchesHwKey(key, gpu)),
            );
            if (match) {
              // Avoid duplicates if same entry covers multiple uncovered GPUs
              if (
                !inheritedEntries.some(
                  (e) => e.inheritedFromDate === prior.date && e.description === match.description,
                )
              ) {
                inheritedEntries.push({ ...match, inheritedFromDate: prior.date });
              }
              break;
            }
          }
        }

        return {
          ...item,
          entries: directEntries,
          inheritedEntries,
        };
      })
      .filter((item) => item.entries.length > 0 || item.inheritedEntries.length > 0);
  }, [changelogs, selectedGPUs, selectedPrecisions]);

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
      <button
        type="button"
        onClick={handleToggle}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

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
                {item.inheritedEntries.map((entry, entryIndex) => (
                  <div
                    key={`inherited-${entryIndex}`}
                    className="text-sm text-muted-foreground pl-5 italic"
                  >
                    <span className="text-xs opacity-70">(from {entry.inheritedFromDate})</span>{' '}
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
