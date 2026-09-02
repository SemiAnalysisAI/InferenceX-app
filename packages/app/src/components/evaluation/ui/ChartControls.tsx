'use client';

import { ControlPanel } from '@/components/ui/control-panel';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { useOpenDropdown } from '@/hooks/useOpenDropdown';
import { ChevronDownIcon } from 'lucide-react';

import { useEvaluation } from '@/components/evaluation/EvaluationContext';
import { Button } from '@/components/ui/button';
import { ModelSelector, PrecisionSelector } from '@/components/ui/chart-selectors';
import { DatePicker } from '@/components/ui/date-picker';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { MultiSelect } from '@/components/ui/multi-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MobileControlSection } from '@/components/ui/mobile-control-section';

const STRINGS = {
  en: {
    benchmarkGroup: 'Benchmark',
    runGroup: 'Run context',
    benchmarkLabel: 'Benchmark',
    benchmarkTooltip:
      'The standardized test used to measure model performance. Common benchmarks include reasoning, coding, and knowledge-based evaluations.',
    selectBenchmark: 'Select benchmark',
    selectRunDate: 'Select run date',
    changelog: 'Changelog',
    newResultsOn: 'New results on',
    noNewResults: 'No new results for this model on this date.',
    secondaryControls: 'More run controls',
    changed: 'changed',
  },
  zh: {
    benchmarkGroup: '基准测试',
    runGroup: '运行信息',
    benchmarkLabel: '基准测试',
    benchmarkTooltip:
      '用于衡量模型性能的标准化测试。常见的基准测试包括推理能力、编程能力和知识评估。',
    selectBenchmark: '选择基准测试',
    selectRunDate: '选择运行日期',
    changelog: '变更记录',
    newResultsOn: '新结果 ·',
    noNewResults: '该日期该模型无新结果。',
    secondaryControls: '更多运行设置',
    changed: '项已更改',
  },
};

export default function EvaluationChartControls() {
  const t = STRINGS[useLocale()];
  const { openDropdown, handleDropdownOpenChange } = useOpenDropdown<string>();

  const {
    selectedBenchmark,
    setSelectedBenchmark,
    selectedModel,
    setSelectedModel,
    selectedRunDate,
    setSelectedRunDate,
    availableBenchmarks,
    availableModels,
    availableDates,
    changelogEntries,
    selectedPrecisions,
    setSelectedPrecisions,
    availablePrecisions,
  } = useEvaluation();
  const secondaryCount = selectedRunDate === availableDates.at(-1) ? 0 : 1;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <ControlPanel legend={t.benchmarkGroup}>
          <div
            className={`grid min-w-0 gap-3 ${availablePrecisions.length > 0 ? 'md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}`}
          >
            <div className="min-w-0">
              <ModelSelector
                value={selectedModel || ''}
                onChange={(value) => {
                  setSelectedModel(value);
                  track('evaluation_model_selected', { model: value });
                }}
                open={openDropdown === 'model'}
                onOpenChange={handleDropdownOpenChange('model')}
                availableModels={availableModels}
              />
            </div>
            <div className="flex min-w-0 flex-col space-y-1.5">
              <LabelWithTooltip
                htmlFor="eval-benchmark-select"
                label={t.benchmarkLabel}
                tooltip={t.benchmarkTooltip}
              />
              <MultiSelect
                options={availableBenchmarks.map((benchmark) => ({
                  value: benchmark,
                  label: benchmark.toUpperCase(),
                }))}
                value={selectedBenchmark ? [selectedBenchmark] : []}
                onChange={(values) => {
                  const next = values[0];
                  if (!next) return;
                  setSelectedBenchmark(next);
                  track('evaluation_benchmark_selected', { benchmark: next });
                }}
                open={openDropdown === 'benchmark'}
                onOpenChange={handleDropdownOpenChange('benchmark')}
                triggerId="eval-benchmark-select"
                triggerTestId="evaluation-benchmark-selector"
                placeholder={t.selectBenchmark}
                minSelections={1}
                maxSelections={1}
                showClearAll={false}
                searchable={false}
                plainSelectedText
                showSelectionSummary={false}
              />
            </div>
            <PrecisionSelector
              id="eval-precision-select"
              value={selectedPrecisions}
              onChange={(value) => {
                setSelectedPrecisions(value);
                track('evaluation_precision_selected', { precision: value.join(',') });
              }}
              open={openDropdown === 'precision'}
              onOpenChange={handleDropdownOpenChange('precision')}
              availablePrecisions={availablePrecisions}
              data-testid="evaluation-precision-selector"
            />
          </div>
        </ControlPanel>

        <MobileControlSection
          label={t.secondaryControls}
          count={secondaryCount}
          countLabel={t.changed}
          testId="evaluation-secondary-controls"
        >
          <ControlPanel legend={t.runGroup} className="content-end">
            <div className="flex min-w-0 flex-col gap-2 text-muted-foreground sm:flex-row sm:items-end">
              <div className="min-w-0">
                <DatePicker
                  date={selectedRunDate}
                  onChange={(date) => {
                    setSelectedRunDate(date);
                    track('evaluation_date_selected', { date });
                  }}
                  placeholder={t.selectRunDate}
                  availableDates={availableDates}
                />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="self-start sm:self-auto">
                    <strong>{t.changelog}</strong>
                    <ChevronDownIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  collisionPadding={12}
                  className="max-h-[min(32rem,calc(100vh-1.5rem))] w-[min(400px,calc(100vw-1.5rem))] overflow-y-auto"
                >
                  <div className="flex min-w-0 flex-col gap-3">
                    <div className="text-xs font-bold">
                      {t.newResultsOn} {selectedRunDate}
                    </div>
                    {changelogEntries.length > 0 ? (
                      changelogEntries.map((entry) => (
                        <div key={entry.benchmark} className="flex min-w-0 flex-col gap-1 text-xs">
                          <div className="font-semibold">{entry.benchmark.toUpperCase()}</div>
                          <ul className="list-disc break-words pl-4 [overflow-wrap:anywhere]">
                            {entry.configs.map((config) => (
                              <li key={config} className="break-words [overflow-wrap:anywhere]">
                                {config}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">{t.noNewResults}</p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </ControlPanel>
        </MobileControlSection>
      </div>
    </TooltipProvider>
  );
}
