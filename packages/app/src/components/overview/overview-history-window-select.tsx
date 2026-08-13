'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics';
import type { OverviewHistoryWindowKey } from '@/lib/overview-data';

import { useOverviewComparisonMode, useOverviewNavigation } from './overview-navigation';

interface WindowOption {
  href: string;
  label: string;
  value: OverviewHistoryWindowKey;
}

export function OverviewHistoryWindowSelect({
  ariaLabel,
  value: committedValue,
  options,
}: {
  ariaLabel: string;
  value: OverviewHistoryWindowKey;
  options: readonly WindowOption[];
}) {
  const navigation = useOverviewNavigation();
  // Control the trigger from the pending URL so a window chosen during a slow
  // load shows immediately and re-selecting the previous window undoes it
  // instead of being dropped by the `next === value` guard. A pending switch
  // back to hardware mode carries no window, so keep the committed one.
  const pendingMode = useOverviewComparisonMode();
  const value = pendingMode === 'hardware' ? committedValue : pendingMode;

  return (
    <Select
      value={value}
      onValueChange={(next: OverviewHistoryWindowKey) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option === undefined || next === value) return;
        track('overview_history_window_changed', { from: value, to: next });
        navigation.push(option.href, ['compare']);
      }}
    >
      <SelectTrigger
        data-testid="overview-history-window-select"
        aria-label={ariaLabel}
        size="sm"
        className="h-8 border-0 bg-transparent px-1.5 text-sm font-semibold shadow-none hover:bg-muted/60 focus-visible:ring-2"
      >
        <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="center">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} data-overview-window={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
