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
  // Read from context, not from the payload: the reference is derived from the
  // URL, so the trigger reflects a second choice made during a pending load
  // instead of silently discarding it. Nothing to prefetch — a reference change
  // costs no request.
  const value = useOverviewReference();
  // A portalled menu lands on `document.body`, which is outside the element the
  // browser is showing fullscreen and outside the `zoom` the matrix is scaled
  // by. Rendering it in place keeps it both visible and the same size as the
  // tab that opened it.
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
