'use client';

import { ChartNoAxesCombined } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    title: 'No data available',
    hidden: 'Matching measurements exist, but their chip series are hidden.',
    filtered:
      'No points match this selection. Try removing a quick filter; your model, workload, precision and date will stay unchanged.',
    clipped:
      'Matching measurements are outside the chart limits. They are still available in the table.',
    hint: 'No measurements to plot for this selection. Review the benchmark controls above or adjust quick filters.',
    chips: 'Show matching chips',
    clear: 'Clear quick filters',
    edit: 'Edit quick filters',
    table: 'View data table',
  },
  zh: {
    title: '暂无数据',
    hidden: '有符合条件的测量数据，但对应的芯片曲线已隐藏。',
    filtered:
      '当前选择没有可显示的数据点。可尝试移除快捷筛选条件；模型、工作负载、精度和日期将保持不变。',
    clipped: '符合条件的测量数据超出了图表范围，仍可在数据表中查看。',
    hint: '当前选择没有可绘制的测量数据。请检查上方的基准测试设置，或调整快捷筛选。',
    chips: '显示匹配的芯片',
    clear: '清除快捷筛选',
    edit: '调整快捷筛选',
    table: '查看数据表',
  },
} as const;

export function ScatterEmptyState({
  reason,
  onShowChips,
  onClearFilters,
  onEditFilters,
  onShowTable,
}: {
  reason: 'hidden' | 'filtered' | 'clipped' | 'selection';
  onShowChips: () => void;
  onClearFilters: () => void;
  onEditFilters: () => void;
  onShowTable?: () => void;
}) {
  const t = STRINGS[useLocale()];
  return (
    <div
      data-testid="scatter-empty-state"
      data-reason={reason}
      className="pointer-events-auto mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border bg-background/95 p-5 text-center shadow-sm"
    >
      <ChartNoAxesCombined className="size-7 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold">{t.title}</h3>
        <p className="text-sm text-muted-foreground">
          {reason === 'selection' ? t.hint : t[reason]}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {reason === 'hidden' && (
          <Button
            size="sm"
            variant="outline"
            onClick={onShowChips}
            data-testid="scatter-empty-show-chips"
          >
            {t.chips}
          </Button>
        )}
        {reason === 'filtered' && (
          <Button
            size="sm"
            variant="outline"
            onClick={onClearFilters}
            data-testid="scatter-empty-clear-filters"
          >
            {t.clear}
          </Button>
        )}
        {reason === 'clipped' && onShowTable && (
          <Button
            size="sm"
            variant="outline"
            onClick={onShowTable}
            data-testid="scatter-empty-show-table"
          >
            {t.table}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onEditFilters}
          data-testid="scatter-empty-quick-filters"
        >
          {t.edit}
        </Button>
      </div>
    </div>
  );
}
