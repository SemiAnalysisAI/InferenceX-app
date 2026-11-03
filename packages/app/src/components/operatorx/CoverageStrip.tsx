import type { OperatorXStatus } from '@semianalysisai/inferencex-db/operatorx/normalize';

import type { Locale } from '@/lib/i18n/i18n';
import { useLocale } from '@/lib/i18n/use-locale';

import { hardwareLabel } from './compare/hardware';
import type { ComparisonModel } from './compare/model';

const STATES: {
  id: OperatorXStatus | 'not-run';
  label: Record<Locale, string>;
  className: string;
}[] = [
  { id: 'ok', label: { en: 'Measured', zh: '已实测' }, className: 'bg-success/70' },
  {
    id: 'unsupported',
    label: { en: 'Unsupported', zh: '不支持' },
    className: 'bg-muted-foreground/40',
  },
  { id: 'error', label: { en: 'Error', zh: '出错' }, className: 'bg-destructive/70' },
  { id: 'missing', label: { en: 'No result', zh: '无结果' }, className: 'bg-warning/70' },
  { id: 'not-run', label: { en: 'Not run', zh: '未运行' }, className: 'bg-muted' },
];

export function CoverageStrip({ model }: { model: ComparisonModel }) {
  const locale = useLocale();
  const total = model.view.cases.length;
  return (
    <div data-testid="operatorx-coverage" className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span>
          {locale === 'zh'
            ? `${total.toLocaleString()} 个用例的覆盖情况`
            : `Coverage of ${total.toLocaleString()} cases`}
        </span>
        {STATES.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className={`inline-block size-2 rounded-sm ${s.className}`} />
            {s.label[locale]}
          </span>
        ))}
      </div>
      <ul className="grid gap-x-5 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {sortHardware(Object.keys(model.view.measurements)).map((hw) => {
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
              <span className="min-w-16 shrink-0 whitespace-nowrap">{hardwareLabel(hw)}</span>
              <span
                className="flex h-1.5 min-w-0 flex-1 gap-px overflow-hidden rounded-full"
                role="img"
                aria-label={`${hardwareLabel(hw)}: ${STATES.map((s) => `${s.label[locale]} ${counts.get(s.id) ?? 0}`).join(', ')}`}
              >
                {STATES.map((s) => {
                  const n = counts.get(s.id) ?? 0;
                  return n ? (
                    <span
                      key={s.id}
                      className={s.className}
                      style={{ flexGrow: n }}
                      title={`${hardwareLabel(hw)} · ${s.label[locale]}: ${n.toLocaleString()}`}
                    />
                  ) : null;
                })}
              </span>
              <span className="min-w-20 shrink-0 whitespace-nowrap text-right text-muted-foreground tabular-nums">
                {ok.toLocaleString()}/{total.toLocaleString()}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
