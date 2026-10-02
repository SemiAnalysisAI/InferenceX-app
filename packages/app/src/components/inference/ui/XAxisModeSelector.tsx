'use client';

import { useEffect, useState } from 'react';
import { useInferenceActions, useInferenceDisplay, useInferenceFilters } from '../InferenceContext';
import { Sequence } from '@/lib/data-mappings';
import { track } from '@/lib/analytics';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { X_AXIS_EXPLANATIONS, type XAxisKind } from '../axis-metric-explanations';
import { isAgenticOnlyXAxisMode, type XAxisMode } from '../hooks/useChartData';
import { useLocale } from '@/lib/use-locale';
import type { FixedSequenceStatistic } from '../utils/resolveXAxisField';
import { NormalizedInteractivityHelpLink } from './NormalizedInteractivityHelpLink';

const X_AXIS_OPTIONS: { value: XAxisMode; kind: XAxisKind; label: string; labelZh: string }[] = [
  {
    value: 'e2e-normalized-interactivity',
    kind: 'e2eNormalizedInteractivity',
    label: 'E2E Normalized Interactivity',
    labelZh: '端到端归一化交互性',
  },
  { value: 'concurrency', kind: 'concurrency', label: 'Concurrency', labelZh: '并发数' },
  { value: 'interactivity', kind: 'interactivity', label: 'Interactivity', labelZh: '交互性' },
  { value: 'e2e', kind: 'e2eLatency', label: 'E2E Latency', labelZh: '端到端延迟' },
  { value: 'ttft', kind: 'ttft', label: 'TTFT', labelZh: 'TTFT' },
];

const STRINGS = {
  en: {
    label: 'X-Axis Metric',
    statistic: 'Service Statistic',
    mean: 'Mean',
    median: 'Median',
    statisticHelp:
      'Mean interactivity is 1 ÷ mean time per output token (TPOT, in seconds), not the arithmetic mean of per-request token rates. Mean TTFT and E2E use their reported means; unavailable measurements are omitted. Median uses the reported median for each metric.',
    help: 'Choose the horizontal axis: Concurrency, Interactivity, end-to-end latency, or Time To First Token (TTFT). Agentic scenarios also offer E2E Normalized Interactivity.',
  },
  zh: {
    label: 'X 轴指标',
    statistic: '服务指标统计量',
    mean: '平均值',
    median: '中位数',
    statisticHelp:
      '平均交互性 = 1 ÷ 平均每输出 token 耗时（TPOT，单位为秒），不是逐请求 token 速率的算术平均值。平均 TTFT 和端到端延迟使用各自上报的平均值；缺失的数据点不显示。中位数选项使用各指标上报的中位数。',
    help: '选择横轴指标：并发数、交互性、端到端延迟或首 token 延迟（TTFT）。Agentic 场景还支持端到端归一化交互性。',
  },
} as const;

export function XAxisModeSelector() {
  const {
    selectedXAxisMode: value,
    selectedPercentile,
    fixedSequenceStatistic,
  } = useInferenceDisplay();
  const { setSelectedXAxisMode, setFixedSequenceStatistic } = useInferenceActions();
  const { selectedSequence } = useInferenceFilters();
  const isAgentic = selectedSequence === Sequence.AgenticTraces;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const locale = useLocale();
  const t = STRINGS[locale];
  // Match SSR and the initial client render before URL-backed scenario state settles.
  const options = X_AXIS_OPTIONS.filter(
    ({ value: option }) => !mounted || isAgentic || !isAgenticOnlyXAxisMode(option),
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex w-full flex-wrap gap-4">
        <div
          className={`flex w-full min-w-0 flex-col space-y-1.5 ${isAgentic ? 'max-w-72' : 'max-w-44'}`}
        >
          <LabelWithTooltip htmlFor="x-axis-mode-select" label={t.label} tooltip={t.help} />
          <SearchableSelect
            value={value}
            triggerId="x-axis-mode-select"
            triggerTestId="x-axis-mode-selector"
            placeholder={t.label}
            initialLabel={locale === 'zh' ? '交互性' : 'Interactivity'}
            searchable={false}
            onValueChange={(mode) => {
              setSelectedXAxisMode(mode as XAxisMode);
              track('latency_x_axis_mode_selected', { mode });
            }}
            groups={[
              {
                label: '',
                options: options.map(({ value: option, kind, label, labelZh }) => ({
                  value: option,
                  label: locale === 'zh' ? labelZh : label,
                  testId: `x-axis-mode-${option}`,
                  help: (
                    <>
                      <p className="text-xs">
                        {X_AXIS_EXPLANATIONS[kind].name[locale](
                          isAgentic
                            ? selectedPercentile.toUpperCase()
                            : fixedSequenceStatistic === 'mean'
                              ? 'Mean'
                              : 'Median',
                        )}
                      </p>
                      <p>{X_AXIS_EXPLANATIONS[kind].description[locale]}</p>
                      {isAgenticOnlyXAxisMode(option) && (
                        <NormalizedInteractivityHelpLink locale={locale} />
                      )}
                    </>
                  ),
                })),
              },
            ]}
          />
        </div>
        {mounted && !isAgentic && value !== 'concurrency' && (
          <div className="flex w-full max-w-44 min-w-0 flex-col space-y-1.5">
            <LabelWithTooltip
              htmlFor="fixed-sequence-statistic-select"
              label={t.statistic}
              tooltip={t.statisticHelp}
            />
            <SearchableSelect
              value={fixedSequenceStatistic}
              triggerId="fixed-sequence-statistic-select"
              triggerTestId="fixed-sequence-statistic-selector"
              placeholder={t.statistic}
              searchable={false}
              onValueChange={(statistic) => {
                setFixedSequenceStatistic(statistic as FixedSequenceStatistic);
                track('latency_service_statistic_selected', { statistic });
              }}
              groups={[
                {
                  label: '',
                  options: (['median', 'mean'] as const).map((statistic) => ({
                    value: statistic,
                    label: t[statistic],
                    testId: `fixed-sequence-statistic-${statistic}`,
                    help: <p>{t.statisticHelp}</p>,
                  })),
                },
              ]}
            />
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
