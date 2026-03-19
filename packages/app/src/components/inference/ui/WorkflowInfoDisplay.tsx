import { ChevronDownIcon, ChevronLeft, ChevronRight } from 'lucide-react';

import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateRepoUrl } from '@/lib/utils';

import { useGlobalFilters } from '@/components/GlobalFilterContext';
import { useInference } from '@/components/inference/InferenceContext';
import { WorkflowInfo } from '@/components/inference/types';
import {
  formatChangelogDescription,
  formatConfigKeys,
} from '@/components/inference/utils/changelogFormatters';

export default function WorkflowInfoDisplay({
  workflowInfo,
}: {
  workflowInfo: WorkflowInfo[] | null;
}) {
  const {
    selectedRunDate,
    setSelectedRunDate,
    availableDates,
    availableRuns,
    selectedRunId,
    setSelectedRunId,
    isCheckingAvailableDates,
  } = useInference();

  const { effectivePrecisions } = useGlobalFilters();

  // Navigation functions for runs
  const runIds = availableRuns ? Object.keys(availableRuns) : [];
  const currentRunIndex = runIds.indexOf(selectedRunId);

  const canGoPreviousRun = () => {
    return currentRunIndex > 0;
  };

  const canGoNextRun = () => {
    return currentRunIndex >= 0 && currentRunIndex < runIds.length - 1;
  };

  const handleGoPreviousRun = () => {
    if (canGoPreviousRun()) {
      track('inference_run_previous');
      setSelectedRunId(runIds[currentRunIndex - 1]);
    }
  };

  const handleGoNextRun = () => {
    if (canGoNextRun()) {
      track('inference_run_next');
      setSelectedRunId(runIds[currentRunIndex + 1]);
    }
  };

  if (!workflowInfo || workflowInfo.length === 0 || !workflowInfo[0]) {
    return (
      <div className="flex flex-col lg:flex-row gap-2 text-muted-foreground">
        <DatePicker
          date={selectedRunDate}
          onChange={(date) => setSelectedRunDate(date)}
          availableDates={availableDates}
          isCheckingAvailableDates={isCheckingAvailableDates}
        />
      </div>
    );
  }

  const changelog = (() => {
    const raw = availableRuns ? availableRuns[selectedRunId]?.changelog || null : null;
    if (!raw) return null;
    // Filter config_keys by selected precisions, drop entries with no matching keys
    const filtered = raw.entries
      .map((entry) => ({
        ...entry,
        config_keys: entry.config_keys.filter((key) => {
          const precision = key.split('-')[1];
          return effectivePrecisions.includes(precision);
        }),
      }))
      .filter((entry) => entry.config_keys.length > 0);
    return filtered.length > 0 ? { entries: filtered } : null;
  })();

  return (
    <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 text-muted-foreground">
      {/* <div className="flex items-center gap-2">
        <CalendarRange size={16} />
        <strong>Run Date:</strong> {workflowInfo[0].run_date} UTC
      </div> */}
      <DatePicker
        date={selectedRunDate}
        onChange={(date) => setSelectedRunDate(date)}
        availableDates={availableDates}
        isCheckingAvailableDates={isCheckingAvailableDates}
      />
      {availableRuns ? (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoPreviousRun}
            disabled={!canGoPreviousRun()}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select
            value={selectedRunId}
            onValueChange={(value) => {
              track('inference_run_selected', { run: value });
              setSelectedRunId(value);
            }}
          >
            <SelectTrigger
              id="run-select"
              className="w-full border-0 shadow-none font-bold [&_[data-external-link]_svg]:pointer-events-auto"
              onPointerDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('[data-external-link]')) {
                  e.preventDefault();
                  e.stopPropagation();
                  const runUrl = availableRuns[selectedRunId]?.runUrl;
                  if (runUrl) {
                    window.open(updateRepoUrl(runUrl), '_blank', 'noopener,noreferrer');
                  }
                }
              }}
            >
              <SelectValue placeholder="Run" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(availableRuns).map((run, index) => {
                const runUrl = updateRepoUrl(availableRuns[run].runUrl);
                return (
                  <SelectItem
                    key={run}
                    value={run}
                    onPointerDown={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('[data-external-link]')) {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(runUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    <span className="flex items-center gap-1">
                      Run {index + 1}/{runIds.length}
                      <span
                        data-external-link
                        className="inline-flex ml-1 cursor-pointer [&_svg]:pointer-events-auto"
                      >
                        <ExternalLinkIcon />
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoNextRun}
            disabled={!canGoNextRun()}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
      {changelog && (
        <div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost">
                <strong>Changelog</strong>
                <ChevronDownIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px]">
              <div className="break-words">
                {changelog.entries.length > 0 ? (
                  <>
                    {changelog.entries.map((entry, index) => (
                      <div key={index}>
                        {index > 0 && <hr className="my-3" />}
                        <div className="flex flex-col gap-2 text-xs line-break-words">
                          <div className="text-xs font-bold">Description</div>
                          {formatChangelogDescription(entry.description)}
                          <div className="text-xs font-bold">Updated Configs</div>
                          <ul className="list-disc pl-4">
                            {entry.config_keys.map((key: string) => (
                              <li key={key}>{formatConfigKeys(key)}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                    {changelog.entries[0]?.head_ref && (
                      <a
                        href={`https://github.com/SemiAnalysisAI/InferenceX/commit/${changelog.entries[0].head_ref}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs hover:underline text-foreground underline"
                      >
                        Git Commit
                      </a>
                    )}
                  </>
                ) : (
                  'No runs found'
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
