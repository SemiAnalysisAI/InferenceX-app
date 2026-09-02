'use client';

import { useEffect, useState } from 'react';
import { useInferenceActions, useInferenceDisplay, useInferenceFilters } from '../InferenceContext';
import { Sequence } from '@/lib/data-mappings';
import { track } from '@/lib/analytics';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isAgenticOnlyXAxisMode, type XAxisMode } from '../hooks/useChartData';
import { useLocale } from '@/lib/use-locale';
import { NormalizedInteractivityHelpLink } from './NormalizedInteractivityHelpLink';

const X_AXIS_OPTIONS: { value: XAxisMode; label: string; labelZh: string }[] = [
  {
    value: 'e2e-normalized-interactivity',
    label: 'E2E Normalized Interactivity',
    labelZh: '端到端归一化交互性',
  },
  { value: 'interactivity', label: 'Interactivity', labelZh: '交互性' },
  { value: 'e2e', label: 'E2E Latency', labelZh: '端到端延迟' },
  { value: 'ttft', label: 'TTFT', labelZh: 'TTFT' },
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
  const { selectedXAxisMode: value } = useInferenceDisplay();
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
  const selected = X_AXIS_OPTIONS.find((option) => option.value === value)!;
  const selectedLabel = locale === 'zh' ? selected.labelZh : selected.label;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-w-0 flex-col space-y-1.5">
        <LabelWithTooltip
          htmlFor="x-axis-mode-select"
          label={t.label}
          tooltip={
            <>
              {t.help}
              {mounted && isAgentic && (
                <span className="mt-2 block">
                  <NormalizedInteractivityHelpLink locale={locale} />
                </span>
              )}
            </>
          }
        />
        <Select
          value={value}
          onValueChange={(mode: XAxisMode) => {
            setSelectedXAxisMode(mode);
            track('latency_x_axis_mode_selected', { mode });
          }}
        >
          <SelectTrigger
            id="x-axis-mode-select"
            data-testid="x-axis-mode-selector"
            data-mode={value}
            className="w-full"
            title={selectedLabel}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(({ value: option, label, labelZh }) => (
              <SelectItem key={option} value={option} data-testid={`x-axis-mode-${option}`}>
                {locale === 'zh' ? labelZh : label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </TooltipProvider>
  );
}
