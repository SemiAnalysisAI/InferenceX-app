'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics/analytics';
import type { OverviewReferenceHardware } from '@/lib/overview/overview-data';

import { useOverviewNavigation, useOverviewReference } from './overview-navigation';
import { useIsPresenting } from './overview-presentation';

interface ReferenceOption {
  href: string;
  label: string;
  value: OverviewReferenceHardware;
}

export function OverviewReferenceSelect({
  ariaLabel,
  options,
}: {
  ariaLabel: string;
  options: readonly ReferenceOption[];
}) {
  const navigation = useOverviewNavigation();
  const value = useOverviewReference();
  const presenting = useIsPresenting();

  return (
    <Select
      value={value}
      onValueChange={(next: OverviewReferenceHardware) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option === undefined || next === value) return;
        track('overview_reference_changed', { from: value, to: next });
        navigation.push(option.href, ['ref']);
      }}
    >
      <SelectTrigger
        data-testid="overview-reference-select"
        aria-label={ariaLabel}
        size="sm"
        className="h-8 border-0 bg-transparent px-1.5 text-sm font-semibold shadow-none hover:bg-muted/60"
      >
        <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="center" portalled={!presenting}>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            data-overview-reference={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
