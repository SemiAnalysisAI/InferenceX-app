import type { OperatorXStatus } from '@semianalysisai/inferencex-db/operatorx/normalize';

import { hardwareLabel } from './compare/hardware';
import type { ComparisonModel } from './compare/model';

const STATES: { id: OperatorXStatus | 'not-run'; label: string; className: string }[] = [
  { id: 'ok', label: 'Measured', className: 'bg-emerald-500/70' },
  { id: 'unsupported', label: 'Unsupported', className: 'bg-muted-foreground/40' },
  { id: 'error', label: 'Error', className: 'bg-red-500/70' },
  { id: 'missing', label: 'No result', className: 'bg-amber-500/70' },
  { id: 'not-run', label: 'Not run', className: 'bg-muted' },
];

/** Per-GPU status breakdown of the workload's cases, as thin stacked bars. */
export function CoverageStrip({ model }: { model: ComparisonModel }) {
  const total = model.view.cases.length;
  return (
    <div data-testid="operatorx-coverage" className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span>Coverage of {total.toLocaleString()} cases</span>
        {STATES.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className={`inline-block size-2 rounded-sm ${s.className}`} />
            {s.label}
          </span>
        ))}
      </div>
      <ul className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {model.available.map((hw) => {
          const status = model.view.measurements[hw]?.status ?? [];
          const counts = new Map<string, number>();
          for (let i = 0; i < total; i++) {
            const s = status[i] ?? 'not-run';
            counts.set(s, (counts.get(s) ?? 0) + 1);
          }
          const ok = counts.get('ok') ?? 0;
          return (
            <li
              key={hw}
              className={`flex min-w-0 items-center gap-2 ${model.hardware.includes(hw) ? '' : 'opacity-50'}`}
            >
              <span
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ background: model.colors[hw] }}
              />
              <span className="w-16 shrink-0 truncate">{hardwareLabel(hw)}</span>
              <span
                className="flex h-1.5 min-w-0 flex-1 gap-px overflow-hidden rounded-full"
                role="img"
                aria-label={`${hardwareLabel(hw)}: ${STATES.map((s) => `${s.label} ${counts.get(s.id) ?? 0}`).join(', ')}`}
              >
                {STATES.map((s) => {
                  const n = counts.get(s.id) ?? 0;
                  return n ? (
                    <span
                      key={s.id}
                      className={s.className}
                      style={{ flexGrow: n }}
                      title={`${hardwareLabel(hw)} · ${s.label}: ${n.toLocaleString()}`}
                    />
                  ) : null;
                })}
              </span>
              <span className="w-20 shrink-0 text-right text-muted-foreground tabular-nums">
                {ok.toLocaleString()}/{total.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
