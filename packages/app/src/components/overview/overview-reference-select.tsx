'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics';
import type { OverviewReferenceHardware } from '@/lib/overview-data';

import { useOverviewNavigation } from './overview-navigation';

interface ReferenceOption {
  href: string;
  label: string;
  value: OverviewReferenceHardware;
}

export function OverviewReferenceSelect({
  ariaLabel,
  options,
  value,
}: {
  ariaLabel: string;
  options: readonly ReferenceOption[];
  value: OverviewReferenceHardware;
}) {
  const navigation = useOverviewNavigation();

  return (
    <Select
      value={value}
      onOpenChange={(open) => {
        if (open) options.forEach((option) => navigation.prefetch(option.href, ['ref']));
      }}
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
        className="h-8 border-0 bg-transparent px-1.5 text-sm font-semibold shadow-none hover:bg-muted/60 focus-visible:ring-2"
      >
        <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="center">
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
