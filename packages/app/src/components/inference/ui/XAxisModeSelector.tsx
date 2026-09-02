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
import { NormalizedInteractivityHelpLink } from './NormalizedInteractivityHelpLink';

const X_AXIS_OPTIONS: { value: XAxisMode; kind: XAxisKind; label: string; labelZh: string }[] = [
  {
    value: 'e2e-normalized-interactivity',
    kind: 'e2eNormalizedInteractivity',
    label: 'E2E Normalized Interactivity',
    labelZh: '端到端归一化交互性',
  },
  { value: 'interactivity', kind: 'interactivity', label: 'Interactivity', labelZh: '交互性' },
  { value: 'e2e', kind: 'e2eLatency', label: 'E2E Latency', labelZh: '端到端延迟' },
  { value: 'ttft', kind: 'ttft', label: 'TTFT', labelZh: 'TTFT' },
];

const STRINGS = {
  en: {
    label: 'X-Axis Metric',
    help: 'Choose the horizontal axis: Interactivity, end-to-end latency, or Time To First Token (TTFT). Agentic scenarios also offer E2E Normalized Interactivity.',
  },
  zh: {
    label: 'X 轴指标',
    help: '选择横轴指标：交互性、端到端延迟或首 token 延迟（TTFT）。Agentic 场景还支持端到端归一化交互性。',
  },
} as const;

export function XAxisModeSelector() {
  const { selectedXAxisMode: value, selectedPercentile } = useInferenceDisplay();
  const { setSelectedXAxisMode } = useInferenceActions();
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
      <div className="flex min-w-0 flex-col space-y-1.5">
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
                        isAgentic ? selectedPercentile.toUpperCase() : null,
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
    </TooltipProvider>
  );
}
