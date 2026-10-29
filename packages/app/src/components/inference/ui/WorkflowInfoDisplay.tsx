import { ChevronDownIcon, ChevronLeft, ChevronRight } from 'lucide-react';

import { track } from '@/lib/analytics/analytics';
import { Button } from '@/components/ui/button';
import { ControlPanel } from '@/components/ui/control-panel';
import { DatePicker } from '@/components/ui/date-picker';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateRepoUrl } from '@/lib/shared/utils';
import { useLocale } from '@/lib/i18n/use-locale';
import type { Locale } from '@/lib/i18n/i18n';

import { useGlobalFilterSelection } from '@/providers/GlobalFilterContext';
import {
  useInferenceActions,
  useInferenceAnalyticsContext,
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
    runContext: 'Run context',
    runDate: 'Run date',
    run: 'Run',
    runCount: (index: number, total: number) => workflowRunCountLabel(index, total, 'en'),
    runCountShort: (index: number, total: number) => workflowRunCountShortLabel(index, total, 'en'),
    previousRun: 'Previous run',
    nextRun: 'Next run',
    changelog: 'Changelog',
    description: 'Description',
    updatedConfigs: 'Updated Configs',
    gitCommit: 'Git Commit',
    noChangelog: 'No changelog data available.',
    trackingHistory: 'This date predates changelog tracking.',
  },
  zh: {
    conclusions: { success: '运行成功', failure: '运行失败', cancelled: '运行已取消' },
    runContext: '运行信息',
    runDate: '运行日期',
    run: '运行',
    runCount: (index: number, total: number) => workflowRunCountLabel(index, total, 'zh'),
    runCountShort: (index: number, total: number) => workflowRunCountShortLabel(index, total, 'zh'),
    previousRun: '上一次运行',
    nextRun: '下一次运行',
    changelog: '变更日志',
    description: '说明',
    updatedConfigs: '已更新配置',
    gitCommit: 'Git Commit',
    noChangelog: '暂无变更日志数据。',
    trackingHistory: '该日期早于变更日志开始记录的时间。',
  },
} as const;

const RUN_CONTEXT_GRID = 'grid min-w-0 items-start gap-3 sm:grid-cols-2 lg:max-w-3xl';

export function workflowRunCountLabel(index: number, total: number, locale: Locale): string {
  return locale === 'zh' ? `第 ${index} 次运行（共 ${total} 次）` : `Run ${index}/${total}`;
}

export function workflowRunCountShortLabel(index: number, total: number, locale: Locale): string {
  return locale === 'zh' ? `第 ${index}/${total} 次运行` : `Run ${index}/${total}`;
}

export function getAdjacentRunId(
  runIds: readonly string[],
  selectedRunId: string,
  direction: 'previous' | 'next',
): string | undefined {
  const index = runIds.indexOf(selectedRunId);
  if (index === -1) return undefined;
  const target = direction === 'previous' ? index - 1 : index + 1;
  return target >= 0 && target < runIds.length ? runIds[target] : undefined;
}

export function getLatestRunId(runIds: readonly string[]): string | undefined {
  return runIds.at(-1);
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

function RunOptionLabel({
  conclusion,
  label,
  locale,
}: {
  conclusion: string | null;
  label: string;
  locale: Locale;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <RunConclusionDot conclusion={conclusion} locale={locale} />
      <span className="truncate">{label}</span>
      <span
        data-external-link
        className="inline-flex ml-1 cursor-pointer [&_svg]:pointer-events-auto"
      >
        <ExternalLinkIcon />
      </span>
    </span>
  );
}

export default function WorkflowInfoDisplay() {
  const locale = useLocale();
  const t = WORKFLOW_STRINGS[locale];
  const { selectedRunDate, selectedRunId } = useInferenceFilters();
  const { availableDates, availableRuns, isCheckingAvailableDates } = useInferenceData();
  const { setSelectedRunDate, setSelectedRunId } = useInferenceActions();
  const analyticsContext = useInferenceAnalyticsContext();

  const { effectivePrecisions } = useGlobalFilterSelection();

  const runIds = Object.keys(availableRuns);
  const latestRunId = getLatestRunId(runIds);
  const isLatestRunSelected = latestRunId === undefined || selectedRunId === latestRunId;
  const selectedRunIndex = runIds.indexOf(selectedRunId);
  const previousRunId = getAdjacentRunId(runIds, selectedRunId, 'previous');
  const nextRunId = getAdjacentRunId(runIds, selectedRunId, 'next');

  const selectRun = (runId: string | undefined, source: string) => {
    if (!runId) return;
    track('inference_run_selected', { ...analyticsContext, run: runId, source });
    setSelectedRunId(runId);
  };

  if (runIds.length === 0) {
    return (
      <ControlPanel legend={t.runContext} data-testid="inference-run-context">
        <div className={RUN_CONTEXT_GRID}>
          <DatePicker
            label={t.runDate}
            date={selectedRunDate}
            onChange={(date) => setSelectedRunDate(date)}
            availableDates={availableDates}
            isCheckingAvailableDates={isCheckingAvailableDates}
          />
        </div>
      </ControlPanel>
    );
  }

  const changelog = (() => {
    const raw = availableRuns[selectedRunId]?.changelog || null;
    if (!raw) return null;
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

  const changelogPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-my-1.5 h-8 px-2"
          data-testid="run-changelog-trigger"
        >
          <strong>{t.changelog}</strong>
          <ChevronDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="max-h-[min(32rem,calc(100dvh-1.5rem))] w-[min(400px,calc(100vw-1.5rem))] overflow-y-auto"
      >
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
  );

  return (
    <ControlPanel legend={t.runContext} data-testid="inference-run-context">
      <div className={RUN_CONTEXT_GRID}>
        <DatePicker
          label={t.runDate}
          date={selectedRunDate}
          onChange={(date) => setSelectedRunDate(date)}
          availableDates={availableDates}
          isCheckingAvailableDates={isCheckingAvailableDates}
          isLatestRunSelected={isLatestRunSelected}
          onGoToLatestRun={() => selectRun(latestRunId, 'latest')}
        />
        <div className="flex min-w-0 flex-col space-y-1.5" data-slot="run-field">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="run-select">{t.run}</Label>
            {changelogPopover}
          </div>
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => selectRun(previousRunId, 'previous')}
              disabled={previousRunId === undefined}
              aria-label={t.previousRun}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Select value={selectedRunId} onValueChange={(value) => selectRun(value, 'select')}>
              <SelectTrigger
                id="run-select"
                aria-label={t.run}
                className="w-full [&_[data-external-link]_svg]:pointer-events-auto"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('[data-external-link]')) e.preventDefault();
                }}
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
                <SelectValue placeholder={t.run}>
                  {selectedRunIndex !== -1 && (
                    <RunOptionLabel
                      conclusion={availableRuns[selectedRunId].conclusion}
                      label={t.runCountShort(selectedRunIndex + 1, runIds.length)}
                      locale={locale}
                    />
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {runIds.map((run, index) => {
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
                      <RunOptionLabel
                        conclusion={availableRuns[run].conclusion}
                        label={t.runCount(index + 1, runIds.length)}
                        locale={locale}
                      />
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => selectRun(nextRunId, 'next')}
              disabled={nextRunId === undefined}
              aria-label={t.nextRun}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </ControlPanel>
  );
}
