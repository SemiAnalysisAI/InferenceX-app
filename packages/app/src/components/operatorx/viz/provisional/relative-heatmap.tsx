'use client';

import { hardwareLabel } from '../../compare/hardware';
import { advantage, best, type ComparisonModel, geomean } from '../../compare/model';
import { rankedSlices } from '../../compare/slices';
import { useShowMore } from '../../charts/show-more';
import type { VizDefinition } from '../types';

function RelativeHeatmap({ model }: { model: ComparisonModel }) {
  const { view } = model;
  const rows = rankedSlices(view.op, view.cases);
  const { visible, toggle } = useShowMore(rows, 20);
  const cell = (hw: string, idx: number[]) =>
    geomean(
      idx.flatMap((i) => {
        const b = best(model, i);
        const a = b ? advantage(model, hw, b.hardware, i) : null;
        return a ? [a] : [];
      }),
    );
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left font-medium text-muted-foreground">
                {view.op === 'gemm' ? 'N×K · precision' : 'Layer · precision'}
              </th>
              {model.hardware.map((hw) => (
                <th key={hw} className="w-20 px-2 py-2 font-medium text-muted-foreground">
                  {hardwareLabel(hw)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(([key, idx]) => (
              <tr key={key}>
                <td className="max-w-80 truncate px-2 py-1.5" title={key}>
                  {key} <span className="text-muted-foreground">({idx.length})</span>
                </td>
                {model.hardware.map((hw) => {
                  const v = cell(hw, idx);
                  return (
                    <td
                      key={hw}
                      className="rounded-sm px-2 py-1.5 text-center tabular-nums"
                      style={
                        v === null
                          ? undefined
                          : {
                              background: `color-mix(in oklch, var(--primary) ${Math.round(v ** 2 * 100)}%, transparent)`,
                            }
                      }
                      title={
                        v === null
                          ? 'not measured'
                          : `${hardwareLabel(hw)}: ${(v * 100).toFixed(0)}% of best`
                      }
                    >
                      {v === null ? '–' : `${(v * 100).toFixed(0)}`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Cell: geomean % of the best selected GPU, per case. Darker is closer to best.</span>
        {toggle}
      </div>
    </div>
  );
}

export const relativeHeatmap: VizDefinition = {
  id: 'relative-heatmap',
  title: 'Shape × GPU heatmap',
  description:
    'Each shape family (all sizes of one N×K for GEMM, one layer for MoE) against each GPU, as % of the best GPU on that case.',
  ops: ['gemm', 'moe'],
  wide: true,
  Component: RelativeHeatmap,
};
