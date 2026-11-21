'use client';

import { useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

import { PowerXHiddenRowsToggle } from './PowerXRanking';
import { powerXFrameworkTag } from './powerx-ranking';

const STRINGS = {
  en: {
    ranking: 'Ranking',
    at: (at: number) => `At ${at} tok/s/user`,
    lowerIsBetter: (unit: string) => `${unit} · lower is better`,
    legendHint: 'Click a row to hide or show that GPU; this list is the legend',
    aggregated: 'aggregated',
    aggregatedTitle: (name: string) =>
      `${name} runs aggregated: each GPU does both prefill and decode, so it has no pool to read`,
    hidden: 'hidden',
    noTrace: 'no telemetry',
    loading: 'loading',
    clickToHide: (name: string) => `Click to hide ${name}`,
    clickToShow: (name: string) => `Click to show ${name}`,
    empty: 'No GPU telemetry to rank.',
    best: 'best',
    hiddenCount: (n: number) => `+${n} hidden`,
    showHidden: 'Show',
    collapseHidden: 'Collapse',
  },
  zh: {
    ranking: '排名',
    at: (at: number) => `在 ${at} tok/s/user`,
    lowerIsBetter: (unit: string) => `${unit} · 越低越好`,
    legendHint: '点击一行可隐藏或显示该 GPU；此列表即图例',
    aggregated: '聚合',
    aggregatedTitle: (name: string) =>
      `${name} 以聚合方式运行：每个 GPU 同时执行 prefill 和 decode，没有可读取的分池`,
    hidden: '已隐藏',
    noTrace: '无遥测',
    loading: '加载中',
    clickToHide: (name: string) => `点击隐藏 ${name}`,
    clickToShow: (name: string) => `点击显示 ${name}`,
    empty: '没有可排名的 GPU 遥测数据。',
    best: '最佳',
    hiddenCount: (n: number) => `另有 ${n} 个已隐藏`,
    showHidden: '显示',
    collapseHidden: '收起',
  },
} as const;

export interface PowerXSwingRankingRowView {
  key: string;
  /** The GPU name, e.g. "GB300 NVL72" (plus " · Run 2" when comparing runs). */
  label: string;
  /** The framework, e.g. "Dynamo SGLang": the sub line, so two GB300 NVL72 rows differ. */
  framework?: string;
  /** The full name, e.g. "GB300 NVL72 (Dynamo SGLang)": tooltips and screen readers. */
  fullLabel?: string;
  color: string;
  rank: number | null;
  /** The Max 5 s swing, formatted like the load-swings table; null when there is none. */
  valueText: string | null;
  /** 'best', '+34%', or null. */
  delta: string | null;
  hidden: boolean;
  aggregated: boolean;
  /** The trace the row reads: its concurrency and interactivity. */
  conc: number | null;
  x: number | null;
  /** The row's second line after the load, e.g. "25.2 kW per rack". */
  detail?: string;
  /** The trace's runs are still loading. */
  loading?: boolean;
  /** The trace the Trace control names: highlighted. */
  highlighted?: boolean;
  /** A legend toggle is not available (unofficial runs keep their own selection). */
  locked?: boolean;
}

/**
 * The Over time ranking beside the chart: "At {Compare at} tok/s/user", then one row per GPU
 * ranked by its Max 5 s swing, with Δ vs the best row. The list is the legend: a row click
 * hides or shows that GPU, and hovering a row highlights its line.
 */
export function PowerXSwingRanking({
  at,
  unit,
  rows,
  onToggle,
  onHover,
}: {
  at: number;
  unit: string;
  rows: readonly PowerXSwingRankingRowView[];
  onToggle: (key: string) => void;
  onHover?: (key: string | null) => void;
}) {
  const t = STRINGS[useLocale()];
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const hiddenRows = rows.filter((row) => row.hidden);
  const listed = hiddenOpen
    ? [...rows.filter((row) => !row.hidden), ...hiddenRows]
    : rows.filter((row) => !row.hidden);
  return (
    <aside
      aria-label={t.ranking}
      data-testid="powerx-swing-ranking"
      className="sidebar-legend flex min-w-0 flex-col max-lg:mt-6 lg:ml-10 lg:w-70"
    >
      <div className="mb-2 flex h-5 items-center">
        <span
          className="text-xs whitespace-nowrap text-muted-foreground tabular-nums"
          data-testid="powerx-swing-ranking-at"
        >
          {t.at(at)}
        </span>
      </div>
      <div
        className="border-b border-border pb-2 text-xs text-muted-foreground"
        title={t.legendHint}
      >
        {t.lowerIsBetter(unit)}
      </div>
      <ol className="m-0 list-none p-0" data-testid="powerx-swing-ranking-rows">
        {rows.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t.empty}</li>}
        {listed.map((row) => {
          const aggregatedEmpty = row.aggregated && row.valueText === null;
          const name = row.fullLabel ?? row.label;
          const sub = [
            row.framework ?? '',
            row.conc !== null && row.x !== null ? `c${row.conc} · ${Math.round(row.x)} tok/s` : '',
            row.hidden ? t.hidden : row.loading ? t.loading : '',
            row.hidden || aggregatedEmpty ? '' : (row.detail ?? ''),
          ]
            .filter(Boolean)
            .join(' · ');
          const title = row.aggregated
            ? t.aggregatedTitle(name)
            : row.hidden
              ? t.clickToShow(name)
              : t.clickToHide(name);
          return (
            <li
              key={row.key}
              className={cn(
                'border-b border-border',
                row.highlighted && 'bg-linear-to-r from-muted to-transparent',
              )}
            >
              <button
                type="button"
                aria-pressed={!row.hidden}
                title={title}
                disabled={row.locked}
                data-testid="powerx-swing-ranking-row"
                data-key={row.key}
                data-hidden={row.hidden ? '' : undefined}
                data-aggregated={row.aggregated ? '' : undefined}
                onClick={() => {
                  onToggle(row.key);
                  track('powerx_swing_ranking_row_toggled', {
                    gpu: row.key,
                    action: row.hidden ? 'show' : 'hide',
                  });
                }}
                onMouseEnter={() => onHover?.(row.key)}
                onMouseLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(row.key)}
                onBlur={() => onHover?.(null)}
                className={cn(
                  'group grid w-full cursor-pointer grid-cols-[12px_8px_minmax(0,1fr)_auto_48px] items-center gap-x-2.5 gap-y-0.5 py-3 text-left max-md:grid-cols-[12px_8px_minmax(0,1fr)_auto_44px] max-md:py-2.5',
                  'focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:cursor-default',
                  row.aggregated && 'opacity-60',
                  row.hidden && 'opacity-45',
                )}
              >
                <span className="text-xs text-muted-foreground tabular-nums">
                  {row.rank ?? '–'}
                </span>
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                  <span
                    title={name}
                    className={cn(
                      'truncate underline-offset-3 group-hover:underline group-hover:decoration-border',
                      row.hidden && 'line-through group-hover:line-through',
                    )}
                  >
                    {row.label}
                  </span>
                  {row.framework && (
                    // Phones drop the sub line, so the framework rides on the name line there.
                    <span className="shrink-0 text-xs font-normal text-muted-foreground md:hidden">
                      {powerXFrameworkTag(row.framework)}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-right text-sm whitespace-nowrap tabular-nums',
                    aggregatedEmpty || row.valueText === null
                      ? 'text-xs font-normal text-muted-foreground'
                      : 'font-semibold',
                  )}
                  data-testid="powerx-swing-ranking-value"
                >
                  {aggregatedEmpty
                    ? t.aggregated
                    : (row.valueText ?? (row.hidden || row.loading ? '–' : t.noTrace))}
                </span>
                <span
                  className="text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                  data-testid="powerx-swing-ranking-delta"
                >
                  {row.delta === 'best' ? t.best : (row.delta ?? '')}
                </span>
                {sub && (
                  <span className="col-start-3 col-end-6 text-xs leading-snug text-muted-foreground max-md:hidden">
                    {sub}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {hiddenRows.length > 0 && (
          <PowerXHiddenRowsToggle
            testId="powerx-swing-ranking-hidden"
            count={hiddenRows.length}
            open={hiddenOpen}
            labels={t}
            onToggle={() => {
              setHiddenOpen(!hiddenOpen);
              track('powerx_swing_ranking_hidden_toggled', {
                action: hiddenOpen ? 'collapse' : 'show',
                count: hiddenRows.length,
              });
            }}
          />
        )}
      </ol>
    </aside>
  );
}
