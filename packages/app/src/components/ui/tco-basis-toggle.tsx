'use client';

import { useMemo } from 'react';

import { useGlobalFilterSelection, useGlobalFilterActions } from '@/components/GlobalFilterContext';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics';
import type { TcoBasis } from '@/lib/constants';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

const LABELS = {
  en: { external: 'External', internal: 'Internal', aria: 'TCO basis' },
  zh: { external: '外部', internal: '内部', aria: 'TCO 口径' },
} as const;

/** Global external customer pricing versus internal owner cost selection. */
export function TcoBasisToggle({ source, className }: { source: string; className?: string }) {
  const { tcoBasis } = useGlobalFilterSelection();
  const { setTcoBasis } = useGlobalFilterActions();
  const labels = LABELS[useLocale()];
  const options = useMemo<SegmentedToggleOption<TcoBasis>[]>(
    () => [
      { value: 'external', label: labels.external, testId: 'tco-basis-external' },
      { value: 'internal', label: labels.internal, testId: 'tco-basis-internal' },
    ],
    [labels],
  );

  return (
    <SegmentedToggle
      role="group"
      value={tcoBasis}
      options={options}
      onValueChange={(basis) => {
        setTcoBasis(basis);
        track('tco_basis_changed', { basis, source });
      }}
      ariaLabel={labels.aria}
      testId="tco-basis-toggle"
      className={cn('w-fit self-start', className)}
    />
  );
}
