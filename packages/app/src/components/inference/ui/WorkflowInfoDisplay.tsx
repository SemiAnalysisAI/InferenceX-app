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
import { useLocale } from '@/lib/use-locale';
import type { Locale } from '@/lib/i18n';

import { useGlobalFilterSelection } from '@/components/GlobalFilterContext';
import {
  useInferenceActions,
  useInferenceData,
  useInferenceFilters,
} from '@/components/inference/InferenceContext';
import {
  formatChangelogDescription,
  formatConfigKeys,
} from '@/components/inference/utils/changelogFormatters';

const WORKFLOW_STRINGS = {
  en: {
    conclusions: { success: 'Run succeeded', failure: 'Run failed', cancelled: 'Run cancelled' },
    previousRun: 'Previous run',
    nextRun: 'Next run',
    run: 'Run',
    runCount: (index: number, total: number) => workflowRunCountLabel(index, total, 'en'),
    changelog: 'Changelog',
    description: 'Description',
    updatedConfigs: 'Updated Configs',
    gitCommit: 'Git Commit',
    noChangelog: 'No changelog data available.',
    trackingHistory: 'This date predates changelog tracking.',
  },
  zh: {
    conclusions: { success: '运行成功', failure: '运行失败', cancelled: '运行已取消' },
    previousRun: '上一次运行',
    nextRun: '下一次运行',
    run: '运行',
    runCount: (index: number, total: number) => workflowRunCountLabel(index, total, 'zh'),
    changelog: '变更日志',
    description: '说明',
    updatedConfigs: '已更新配置',
    gitCommit: 'Git Commit',
    noChangelog: '暂无变更日志数据。',
    trackingHistory: '该日期早于变更日志开始记录的时间。',
  },
} as const;

export function workflowRunCountLabel(index: number, total: number, locale: Locale): string {
  return locale === 'zh' ? `第 ${index} 次运行（共 ${total} 次）` : `Run ${index}/${total}`;
}

function RunConclusionDot({ conclusion, locale }: { conclusion: string | null; locale: Locale }) {
  if (!conclusion) return null;
  const color =
    conclusion === 'success'
      ? 'bg-green-500'
      : conclusion === 'failure'
        ? 'bg-red-500'
        : conclusion === 'cancelled'
          ? 'bg-yellow-500'
          : 'bg-gray-400';
  const label = WORKFLOW_STRINGS[locale].conclusions[conclusion as 'success'] ?? conclusion;
  return (
    <span
      className={`inline-block size-2 mr-1 rounded-full ${color} cursor-help`}
      aria-label={label}
      role="img"
    />
  );
}

export default function WorkflowInfoDisplay() {
  const locale = useLocale();
  const t = WORKFLOW_STRINGS[locale];
  const { selectedRunDate, selectedRunId } = useInferenceFilters();
  const { availableDates, availableRuns, isCheckingAvailableDates } = useInferenceData();
  const { setSelectedRunDate, setSelectedRunId } = useInferenceActions();

  const { effectivePrecisions } = useGlobalFilterSelection();

  // Navigation functions for runs
  const runIds = Object.keys(availableRuns);
  const currentRunIndex = runIds.indexOf(selectedRunId);

  const canGoPreviousRun = () => currentRunIndex > 0;

  const canGoNextRun = () => currentRunIndex !== -1 && currentRunIndex < runIds.length - 1;

  const handleGoPreviousRun = () => {
    if (canGoPreviousRun()) {
      track('inference_run_previous', {
        toRun: runIds[currentRunIndex - 1],
        totalRuns: runIds.length,
      });
      setSelectedRunId(runIds[currentRunIndex - 1]);
    }
  };

  const handleGoNextRun = () => {
    if (canGoNextRun()) {
      track('inference_run_next', { toRun: runIds[currentRunIndex + 1], totalRuns: runIds.length });
      setSelectedRunId(runIds[currentRunIndex + 1]);
    }
  };

  if (runIds.length === 0) {
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
    const raw = availableRuns[selectedRunId]?.changelog || null;
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
    <div className="flex flex-wrap gap-2 lg:gap-4 text-muted-foreground">
      <DatePicker
        date={selectedRunDate}
        onChange={(date) => setSelectedRunDate(date)}
        availableDates={availableDates}
        isCheckingAvailableDates={isCheckingAvailableDates}
      />
      {runIds.length > 0 ? (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleGoPreviousRun}
            aria-label={t.previousRun}
            disabled={!canGoPreviousRun()}
            className="size-11 md:size-8"
          >
            <ChevronLeft className="size-4" />
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
              className="w-full [&_[data-external-link]_svg]:pointer-events-auto"
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
              <SelectValue placeholder={t.run} />
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
                      <RunConclusionDot
                        conclusion={availableRuns[run].conclusion}
                        locale={locale}
                      />
                      {t.runCount(index + 1, runIds.length)}
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
            aria-label={t.nextRun}
            disabled={!canGoNextRun()}
            className="size-11 md:size-8"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}
      <div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <strong>{t.changelog}</strong>
              <ChevronDownIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px]">
            <div className="break-words">
              {changelog && changelog.entries.length > 0 ? (
                <>
                  {changelog.entries.map((entry, index) => (
                    <div key={index}>
                      {index > 0 && <hr className="my-3" />}
                      <div className="flex flex-col gap-2 text-xs line-break-words">
                        <div className="text-xs font-bold">{t.description}</div>
                        {formatChangelogDescription(entry.description)}
                        <div className="text-xs font-bold">{t.updatedConfigs}</div>
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
                      {t.gitCommit}
                    </a>
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-2 text-xs">
                  <div className="text-xs font-bold">{t.description}</div>
                  <span className="text-muted-foreground">{t.noChangelog}</span>
                  <span className="text-muted-foreground">{t.trackingHistory}</span>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
