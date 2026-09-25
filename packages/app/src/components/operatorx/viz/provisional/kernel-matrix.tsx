'use client';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';

import { hardwareLabel } from '../../compare/hardware';
import type { ComparisonModel } from '../../compare/model';
import { rankedSlices } from '../../compare/slices';
import type { VizDefinition } from '../types';

/** Kernels used across a slice on one GPU, most frequent first. */
function kernelsOf(model: ComparisonModel, hw: string, idx: number[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const i of idx) {
    const k = model.kernel(hw, i);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

function KernelMatrix({ model }: { model: ComparisonModel }) {
  const { view } = model;
  const rows = rankedSlices(view.op, view.cases);
  const columns: DataTableColumn<[string, number[]]>[] = [
    {
      header: view.op === 'gemm' ? 'N×K · precision' : 'Layer · precision',
      cell: ([key]) => key,
      sortValue: ([key]) => key,
      className: 'min-w-72',
      importance: 'key',
    },
    ...model.hardware.map((hw): DataTableColumn<[string, number[]]> => ({
      header: hardwareLabel(hw),
      importance: 'key',
      sortValue: ([, idx]) => kernelsOf(model, hw, idx)[0]?.[0] ?? '',
      cell: ([, idx]) => {
        const ks = kernelsOf(model, hw, idx);
        if (ks.length === 0) return <span className="text-muted-foreground">–</span>;
        return (
          <span title={ks.map(([k, n]) => `${k} ×${n}`).join('\n')}>
            {ks[0][0]}
            {ks.length > 1 && <span className="text-muted-foreground"> +{ks.length - 1}</span>}
          </span>
        );
      },
    })),
  ];
  return (
    <DataTable
      data={rows}
      columns={columns}
      testId="operatorx-kernel-matrix"
      analyticsPrefix="operatorx_kernels"
    />
  );
}

export const kernelMatrix: VizDefinition = {
  id: 'kernel-matrix',
  title: 'Kernel chosen',
  description:
    'The kernel each GPU’s framework dispatched for each shape family; +n means other sizes used other kernels (hover for all).',
  ops: ['gemm', 'moe'],
  wide: true,
  Component: KernelMatrix,
};
