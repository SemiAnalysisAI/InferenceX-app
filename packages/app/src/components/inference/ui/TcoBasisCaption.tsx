'use client';

import { useInferenceDisplay, useInferenceFilters } from '@/components/inference/InferenceContext';
import { isCostMetric } from '@/components/ui/chart-display-helpers';
import { InfoHelp } from '@/components/ui/option-info';
import { CaptionField } from '@/components/ui/result-context';
import { TcoBasisToggle } from '@/components/ui/tco-basis-toggle';
import { showsTcoBasisSelector } from '@/lib/catalog/data-mappings';
import { useLocale } from '@/lib/i18n/use-locale';
import { useGlobalFilterSelection } from '@/providers/GlobalFilterContext';

const STRINGS = {
  en: {
    label: 'TCO Basis',
    external: 'External',
    internal: 'Internal',
    tooltip:
      'Choose External customer pricing or Internal owner cost. Internal changes only hardware with a separate owner cost, currently TPUv7.',
  },
  zh: {
    label: 'TCO 口径',
    external: '外部',
    internal: '内部',
    tooltip:
      '选择按外部客户价格还是内部持有成本计算 TCO。只有另有内部持有成本的硬件才会受影响，目前仅 TPUv7。',
  },
} as const;

export function TcoBasisCaption({
  hardwareKeys,
  source,
  interactive = true,
}: {
  hardwareKeys: ReadonlySet<string>;
  source: 'inference' | 'historical';
  interactive?: boolean;
}) {
  const t = STRINGS[useLocale()];
  const { selectedModel, selectedSequence } = useInferenceFilters();
  const { selectedYAxisMetric } = useInferenceDisplay();
  const { tcoBasis } = useGlobalFilterSelection();
  if (
    !isCostMetric(selectedYAxisMetric) ||
    !showsTcoBasisSelector(selectedModel, selectedSequence) ||
    ![...hardwareKeys].some((key) => key.split('_')[0] === 'tpuv7')
  ) {
    return null;
  }

  return (
    <CaptionField
      label={t.label}
      value={t[tcoBasis]}
      testId="result-context-tco-basis"
      control={
        interactive ? (
          <span className="inline-flex items-center gap-0.5">
            <TcoBasisToggle source={source} caption />
            <InfoHelp
              label={t.label}
              value="tco-basis"
              analyticsEvent="selector_help_opened"
              align="start"
            >
              {t.tooltip}
            </InfoHelp>
          </span>
        ) : undefined
      }
    />
  );
}
