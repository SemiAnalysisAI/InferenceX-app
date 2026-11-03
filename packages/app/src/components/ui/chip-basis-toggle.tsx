'use client';

import { useMemo } from 'react';

import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import type { ChipBasis } from '@/lib/benchmarks/chip-basis';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

const LABELS = {
  en: {
    pool: 'Per prefill/decode chip',
    total: 'Per total chip',
    aria: 'Disaggregated throughput denominator',
  },
  zh: {
    pool: '按预填充/解码芯片',
    total: '按芯片总数',
    aria: '分离式配置吞吐量的分母口径',
  },
} as const;

/**
 * Chooses which chips divide a disaggregated config's input and output
 * throughput: its prefill or decode pool, or every chip in the deployment.
 */
export function ChipBasisToggle({
  value,
  onValueChange,
  source,
  className,
}: {
  value: ChipBasis;
  onValueChange: (basis: ChipBasis) => void;
  source: string;
  className?: string;
}) {
  const labels = LABELS[useLocale()];
  const options = useMemo<SegmentedToggleOption<ChipBasis>[]>(
    () => [
      { value: 'pool', label: labels.pool, testId: 'chip-basis-pool' },
      { value: 'total', label: labels.total, testId: 'chip-basis-total' },
    ],
    [labels],
  );

  return (
    <SegmentedToggle
      role="group"
      value={value}
      options={options}
      onValueChange={(basis) => {
        onValueChange(basis);
        track('chip_basis_changed', { basis, source });
      }}
      ariaLabel={labels.aria}
      testId="chip-basis-toggle"
      size="sm"
      className={cn('w-fit', className)}
      buttonClassName="text-xs"
    />
  );
}
