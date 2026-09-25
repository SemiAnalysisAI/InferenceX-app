'use client';

import type { OperatorXStatus } from '@semianalysisai/inferencex-db/operatorx/normalize';

import { hardwareLabel } from '../../compare/hardware';
import type { ComparisonModel } from '../../compare/model';
import type { VizDefinition } from '../types';

const STATES: { id: OperatorXStatus | 'not-run'; label: string; className: string }[] = [
  { id: 'ok', label: 'Measured', className: 'bg-emerald-500' },
  { id: 'unsupported', label: 'Unsupported', className: 'bg-muted-foreground/50' },
  { id: 'error', label: 'Error', className: 'bg-red-500' },
  { id: 'missing', label: 'No result', className: 'bg-amber-500' },
  { id: 'not-run', label: 'Not in run', className: 'bg-muted' },
];

function Coverage({ model }: { model: ComparisonModel }) {
  const total = model.view.cases.length;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {model.hardware.map((hw) => {
          const counts = new Map<string, number>();
          const status = model.view.measurements[hw]?.status ?? [];
          for (let i = 0; i < total; i++) {
            const s = status[i] ?? 'not-run';
            counts.set(s, (counts.get(s) ?? 0) + 1);
          }
          return (
            <li key={hw} className="grid grid-cols-[6rem_1fr_3.5rem] items-center gap-3 text-sm">
              <span>{hardwareLabel(hw)}</span>
              <div
                className="flex h-4 gap-0.5 overflow-hidden rounded-sm"
                role="img"
                aria-label={`${hardwareLabel(hw)} coverage`}
              >
                {STATES.map((s) => {
                  const n = counts.get(s.id) ?? 0;
                  return n ? (
                    <div
                      key={s.id}
                      className={s.className}
                      style={{ flexGrow: n }}
                      title={`${s.label}: ${n}`}
                    />
                  ) : null;
                })}
              </div>
              <span className="text-right text-muted-foreground tabular-nums">
                {(((counts.get('ok') ?? 0) / total) * 100).toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {STATES.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span className={`inline-block size-2.5 rounded-sm ${s.className}`} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const coverage: VizDefinition = {
  id: 'coverage',
  title: 'Coverage',
  description: 'How many of the workload’s cases each GPU measured, and why the rest are missing.',
  ops: ['gemm', 'moe'],
  Component: Coverage,
};
