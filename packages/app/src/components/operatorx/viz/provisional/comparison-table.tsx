'use client';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

import { formatRatio } from '../../charts/scales';
import { hardwareLabel } from '../../compare/hardware';
import { advantage, best, type ComparisonModel } from '../../compare/model';
import type { VizDefinition } from '../types';

function ComparisonTable({ model }: { model: ComparisonModel }) {
  const { view, metric, baseline } = model;
  const rows = view.cases.map((_, i) => i);
  const columns: DataTableColumn<number>[] = [
    {
      header: 'Shape',
      cell: (i) => view.cases[i].shape,
      sortValue: (i) => view.cases[i].x ?? 0,
      className: 'whitespace-nowrap',
      importance: 'key',
    },
    {
      header: 'Precision',
      cell: (i) => <span className="text-muted-foreground">{view.cases[i].precision}</span>,
      sortValue: (i) => view.cases[i].precision,
      importance: 'key',
    },
    ...model.hardware.map((hw): DataTableColumn<number> => ({
      header: hardwareLabel(hw),
      align: 'right',
      importance: 'key',
      sortValue: (i) => model.value(hw, i) ?? (metric.better === 'higher' ? -Infinity : Infinity),
      cell: (i) => {
        const v = model.value(hw, i);
        if (v === null) return <span className="text-muted-foreground">–</span>;
        const rel = baseline && hw !== baseline ? advantage(model, hw, baseline, i) : null;
        return (
          <span
            className={`whitespace-nowrap ${best(model, i)?.hardware === hw ? 'font-semibold' : ''}`}
          >
            {metric.format(v)}
            {rel !== null && (
              <span className="ml-1 text-xs text-muted-foreground">{formatRatio(rel)}</span>
            )}
          </span>
        );
      },
    })),
  ];
  return (
    <DataTable
      data={rows}
      columns={columns}
      testId="operatorx-comparison-table"
      analyticsPrefix="operatorx_cases"
    />
  );
}

export const comparisonTable: VizDefinition = {
  id: 'comparison-table',
  title: 'All cases',
  description:
    'Every case with each GPU’s value on the selected metric. Bold is the best GPU; × is the advantage over the baseline.',
  ops: ['gemm', 'moe'],
  wide: true,
  Component: ComparisonTable,
};
