'use client';

import { useMemo } from 'react';

import { useGlobalFilterSelection, useGlobalFilterActions } from '@/providers/GlobalFilterContext';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics/analytics';
import type { TcoBasis } from '@/lib/catalog/constants';
import { showsTcoBasisSelector } from '@/lib/catalog/data-mappings';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

const LABELS = {
  en: { external: 'External', internal: 'Internal', aria: 'TCO basis' },
  zh: { external: '外部', internal: '内部', aria: 'TCO 口径' },
} as const;

export function useShowsTcoBasisSelector(): boolean {
  const { selectedModel, effectiveSequence } = useGlobalFilterSelection();
  return showsTcoBasisSelector(selectedModel, effectiveSequence);
}

export function TcoBasisToggle({
  source,
  className,
  caption = false,
}: {
  source: string;
  className?: string;
  caption?: boolean;
}) {
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
      className={cn('w-fit self-start', caption && 'md:min-h-6', className)}
      buttonClassName={caption ? 'text-xs md:min-h-4 md:py-0' : undefined}
    />
  );
}
