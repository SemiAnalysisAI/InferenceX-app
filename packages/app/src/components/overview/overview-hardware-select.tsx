'use client';

import { MultiSelect } from '@/components/ui/multi-select';
import { track } from '@/lib/analytics';
import {
  OVERVIEW_HARDWARE,
  overviewHardwareLabel,
  type OverviewComparisonMode,
  type OverviewEngineScope,
  type OverviewHardware,
  type OverviewHistoryDays,
  type OverviewModelScope,
  type OverviewReferenceHardware,
  type OverviewTier,
} from '@/lib/overview-data';
import { overviewHref } from '@/lib/overview-links';

import { useOverviewNavigation } from './overview-navigation';
import type { OverviewLocale } from './overview-scorecard';

export function OverviewHardwareSelect({
  locale,
  tier,
  engineScope,
  comparisonMode,
  referenceHardware,
  modelScope,
  historyDays,
  value,
  ariaLabel,
}: {
  locale: OverviewLocale;
  tier: OverviewTier;
  engineScope: OverviewEngineScope;
  comparisonMode: OverviewComparisonMode;
  referenceHardware: OverviewReferenceHardware;
  modelScope: OverviewModelScope;
  historyDays: OverviewHistoryDays;
  value: OverviewHardware[];
  ariaLabel: string;
}) {
  const navigation = useOverviewNavigation();
  const options = OVERVIEW_HARDWARE.map((hardware) => ({
    value: hardware,
    label: overviewHardwareLabel(hardware),
  }));

  return (
    <div>
      <MultiSelect
        triggerTestId="overview-hardware-select"
        ariaLabel={ariaLabel}
        options={options}
        value={value}
        minSelections={1}
        showClearAll={false}
        searchable={false}
        plainSelectedText
        showSelectionSummary={false}
        size="sm"
        className="min-h-11 min-w-56"
        onChange={(nextValues) => {
          const selected = OVERVIEW_HARDWARE.filter((hardware) => nextValues.includes(hardware));
          const href = overviewHref(
            locale,
            tier,
            engineScope,
            comparisonMode,
            referenceHardware,
            modelScope,
            historyDays,
            selected,
          );
          track('overview_selector_changed', {
            control: 'hardware',
            value: selected.join(','),
          });
          navigation.push(href, ['hw']);
        }}
      />
    </div>
  );
}
