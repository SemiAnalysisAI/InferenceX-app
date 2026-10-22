'use client';

import { useMemo } from 'react';

import { useInferenceActions, useInferenceDisplay } from '@/components/inference/InferenceContext';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import type { TokenBasis } from '@/lib/benchmarks/benchmark-transform';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

const LABELS = {
  en: { total: 'Total', uncached: 'Uncached', aria: 'Input tokens counted' },
  zh: { total: '全部', uncached: '未缓存', aria: '计入的输入 token' },
} as const;

export function TokenBasisToggle({ className }: { className?: string }) {
  const { tokenBasis } = useInferenceDisplay();
  const { setTokenBasis } = useInferenceActions();
  const labels = LABELS[useLocale()];
  const options = useMemo<SegmentedToggleOption<TokenBasis>[]>(
    () => [
      { value: 'total', label: labels.total, testId: 'token-basis-total' },
      { value: 'uncached', label: labels.uncached, testId: 'token-basis-uncached' },
    ],
    [labels],
  );

  return (
    <SegmentedToggle
      role="group"
      value={tokenBasis}
      options={options}
      onValueChange={(basis) => {
        setTokenBasis(basis);
        track('inference_token_basis_changed', { basis });
      }}
      ariaLabel={labels.aria}
      testId="token-basis-toggle"
      className={cn('w-fit self-start', className)}
    />
  );
}
