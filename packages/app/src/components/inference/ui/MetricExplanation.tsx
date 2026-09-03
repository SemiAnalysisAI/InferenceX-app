'use client';

import { METRIC_EXPLANATIONS } from '../axis-metric-explanations';
import type { MetricKey } from '../metric-registry';
import { useLocale } from '@/lib/use-locale';

/** Shared by selector help and embedded charts, for official and overlay data alike. */
export function MetricExplanation({ metricKey }: { metricKey: MetricKey }) {
  const locale = useLocale();
  const explanation = METRIC_EXPLANATIONS[metricKey];
  return (
    <>
      <p>{explanation.description[locale]}</p>
      <div className="space-y-1.5">
        <p className="text-xs font-medium">{locale === 'zh' ? '计算公式' : 'Formula'}</p>
        <code className="block whitespace-normal break-words rounded bg-muted p-2 font-mono text-xs">
          {explanation.formula[locale]}
        </code>
      </div>
    </>
  );
}
