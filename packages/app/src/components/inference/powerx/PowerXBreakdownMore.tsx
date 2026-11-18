'use client';

import type { PowerBreakdownView } from '@/components/inference/ui/PowerBreakdownPanel';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

import { PowerXMore, PowerXMoreGroup, PowerXSeg } from './PowerXShell';

const STRINGS = {
  en: { chartStyle: 'Chart style', bars: 'Stacked bars', area: 'Stacked area' },
  zh: { chartStyle: '图表样式', bars: '堆叠柱状图', area: '堆叠面积图' },
} as const;

/** The default drill-down chart style; anything else counts as a More change. */
export const POWERX_BREAKDOWN_VIEW_DEFAULT: PowerBreakdownView = 'area';

/** Breakdown toolbar More: the drill-down's chart style (`i_pbview`). */
export function PowerXBreakdownMore({
  view,
  onViewChange,
}: {
  view: PowerBreakdownView;
  onViewChange: (next: PowerBreakdownView) => void;
}) {
  const t = STRINGS[useLocale()];
  const change = (next: PowerBreakdownView) => {
    onViewChange(next);
    track('powerx_breakdown_view_changed', { view: next });
  };
  return (
    <PowerXMore
      tab="breakdown"
      changed={view === POWERX_BREAKDOWN_VIEW_DEFAULT ? 0 : 1}
      onReset={() => change(POWERX_BREAKDOWN_VIEW_DEFAULT)}
    >
      <PowerXMoreGroup label={t.chartStyle}>
        <PowerXSeg<PowerBreakdownView>
          value={view}
          ariaLabel={t.chartStyle}
          testId="power-breakdown-view"
          onValueChange={change}
          options={[
            { value: 'bars', label: t.bars, testId: 'power-breakdown-view-bars' },
            { value: 'area', label: t.area, testId: 'power-breakdown-view-area' },
          ]}
        />
      </PowerXMoreGroup>
    </PowerXMore>
  );
}
