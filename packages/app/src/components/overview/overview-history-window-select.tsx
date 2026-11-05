'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics/analytics';
import type { OverviewHistoryWindowKey } from '@/lib/overview/overview-data';

import { useOverviewComparisonMode, useOverviewNavigation } from './overview-navigation';
import { useIsPresenting } from './overview-presentation';

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
  const pendingMode = useOverviewComparisonMode();
  const value = pendingMode === 'hardware' ? committedValue : pendingMode;
  const presenting = useIsPresenting();

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
        className="h-8 border-0 bg-transparent px-1.5 text-sm font-semibold shadow-none hover:bg-muted/60"
      >
        <SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="center" portalled={!presenting}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} data-overview-window={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
