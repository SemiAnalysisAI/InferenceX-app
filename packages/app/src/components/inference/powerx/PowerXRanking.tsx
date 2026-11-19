'use client';

import { Check, ChevronDown, ListFilter } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

import { POWERX_SHOWS, powerXFrameworkTag, type PowerXShow } from './powerx-ranking';

const STRINGS = {
  en: {
    ranking: 'Ranking',
    at: (at: number) => `At ${at} tok/s/user`,
    lowerIsBetter: (unit: string) => `${unit} · lower is better`,
    legendHint: 'Click a row to hide or show that GPU; this list is the legend',
    show: 'Show',
    shows: {
      best: 'Best per GPU',
      configs: 'All configs',
      points: 'All points',
    } satisfies Record<PowerXShow, string>,
    filter: 'Filter',
    aggregated: 'aggregated',
    aggregatedTitle: (name: string) =>
      `${name} runs aggregated: each GPU does both prefill and decode, so it has no pool to read`,
    hidden: 'hidden',
    clickToHide: (name: string) => `Click to hide ${name}`,
    clickToShow: (name: string) => `Click to show ${name}`,
    lastVisible: (name: string) => `${name} is the only GPU shown`,
    empty: 'No GPUs match the filters.',
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
    show: '显示',
    shows: {
      best: '每个 GPU 最佳',
      configs: '全部配置',
      points: '全部点',
    } satisfies Record<PowerXShow, string>,
    filter: '筛选',
    aggregated: '聚合',
    aggregatedTitle: (name: string) =>
      `${name} 以聚合方式运行：每个 GPU 同时执行 prefill 和 decode，没有可读取的分池`,
    hidden: '已隐藏',
    clickToHide: (name: string) => `点击隐藏 ${name}`,
    clickToShow: (name: string) => `点击显示 ${name}`,
    lastVisible: (name: string) => `${name} 是唯一显示的 GPU`,
    empty: '没有符合筛选条件的 GPU。',
    best: '最佳',
    hiddenCount: (n: number) => `另有 ${n} 个已隐藏`,
    showHidden: '显示',
    collapseHidden: '收起',
  },
} as const;

export interface PowerXRankingRowView {
  key: string;
  /** The GPU config name, e.g. "GB300 NVL72". */
  label: string;
  /** The full name with its framework, e.g. "GB300 NVL72 (Dynamo TRT)": the row's tooltip. */
  fullLabel?: string;
  color: string;
  /** All GPUs: the config runs disaggregated (prefill and decode pools). */
  pd: boolean;
  framework: string;
  rank: number | null;
  /** The value at Compare at, already formatted; null for aggregated or missing rows. */
  valueText: string | null;
  /** 'best', '+34%', or null. */
  delta: string | null;
  hidden: boolean;
  aggregated: boolean;
  /** The point the row reads: its concurrency and interactivity. */
  conc: number | null;
  x: number | null;
  highlighted?: boolean;
  /** The last visible row cannot hide. */
  locked?: boolean;
}

export interface PowerXRankingProps {
  at: number;
  unit: string;
  show: PowerXShow;
  onShowChange: (show: PowerXShow) => void;
  filterCount: number;
  onFilterOpen: () => void;
  /** The removable filter chips and Clear under the header. */
  filterChips?: ReactNode;
  rows: readonly PowerXRankingRowView[];
  onToggle: (key: string) => void;
}

const RANK_BUTTON =
  'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs whitespace-nowrap text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none max-md:h-9';

function ShowMenu({
  show,
  onShowChange,
}: {
  show: PowerXShow;
  onShowChange: (show: PowerXShow) => void;
}) {
  const t = STRINGS[useLocale()];
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={RANK_BUTTON}
          aria-label={`${t.show}: ${t.shows[show]}`}
          data-testid="powerx-show"
        >
          {t.shows[show]}
          <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1" data-testid="powerx-show-menu">
        <div role="menu" aria-label={t.show} className="flex flex-col">
          {POWERX_SHOWS.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === show}
              data-testid={`powerx-show-${option}`}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-muted max-md:h-11"
              onClick={() => {
                setOpen(false);
                if (option === show) return;
                onShowChange(option);
                track('powerx_show_changed', { show: option, previous_show: show });
              }}
            >
              <Check
                aria-hidden
                className={cn('size-3.5 shrink-0', option === show ? 'opacity-100' : 'opacity-0')}
              />
              {t.shows[option]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The PowerX ranking beside the Energy and Power scatter: "At {Compare at} tok/s/user",
 * Show and Filter, then one row per GPU config ranked at Compare at. The list is the
 * legend: a row click hides or shows that GPU. On phones it is a compact list under the
 * chart (no sub lines).
 */
export function PowerXRanking({
  at,
  unit,
  show,
  onShowChange,
  filterCount,
  onFilterOpen,
  filterChips,
  rows,
  onToggle,
}: PowerXRankingProps) {
  const t = STRINGS[useLocale()];
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const hiddenRows = rows.filter((row) => row.hidden);
  // Hidden GPUs fold into one quiet row; Show lists them (struck through) to bring one back.
  const listed = hiddenOpen
    ? [...rows.filter((row) => !row.hidden), ...hiddenRows]
    : rows.filter((row) => !row.hidden);
  return (
    <aside
      aria-label={t.ranking}
      data-testid="powerx-ranking"
      className="flex min-w-0 flex-col max-lg:mt-6 lg:ml-10 lg:w-70"
    >
      <div className="mb-2 flex h-5 items-center gap-1">
        <span
          className="text-xs whitespace-nowrap text-muted-foreground tabular-nums"
          data-testid="powerx-ranking-at"
        >
          {t.at(at)}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <ShowMenu show={show} onShowChange={onShowChange} />
          <button
            type="button"
            className={RANK_BUTTON}
            data-testid="powerx-filter"
            aria-haspopup="dialog"
            onClick={() => {
              onFilterOpen();
              track('powerx_filter_opened', { count: filterCount });
            }}
          >
            <ListFilter aria-hidden className="size-3.5 text-muted-foreground" />
            {t.filter}
            {filterCount > 0 && (
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-2xs font-semibold text-white tabular-nums"
                data-testid="powerx-filter-count"
              >
                {filterCount}
              </span>
            )}
          </button>
        </span>
      </div>
      <div
        className="border-b border-border pb-2 text-xs text-muted-foreground max-md:hidden"
        title={t.legendHint}
      >
        {t.lowerIsBetter(unit)}
      </div>
      {filterChips}
      <ol className="m-0 list-none p-0" data-testid="powerx-ranking-rows">
        {rows.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t.empty}</li>}
        {listed.map((row) => {
          const aggregatedEmpty = row.aggregated && row.valueText === null;
          const name = row.fullLabel ?? row.label;
          const sub = [
            row.framework,
            row.conc !== null && row.x !== null ? `c${row.conc} · ${Math.round(row.x)} tok/s` : '',
            row.hidden ? t.hidden : '',
          ]
            .filter(Boolean)
            .join(' · ');
          const title = row.aggregated
            ? t.aggregatedTitle(name)
            : row.hidden
              ? t.clickToShow(name)
              : row.locked
                ? t.lastVisible(name)
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
                data-testid={`powerx-ranking-row-${row.key}`}
                data-hidden={row.hidden ? '' : undefined}
                data-aggregated={row.aggregated ? '' : undefined}
                onClick={() => {
                  if (row.locked) return;
                  onToggle(row.key);
                  track('powerx_ranking_row_toggled', {
                    gpu: row.key,
                    action: row.hidden ? 'show' : 'hide',
                  });
                }}
                className={cn(
                  'group grid w-full cursor-pointer grid-cols-[12px_8px_minmax(0,1fr)_auto_48px] items-center gap-x-2.5 gap-y-0.5 py-3 text-left max-md:grid-cols-[12px_8px_minmax(0,1fr)_auto_44px] max-md:py-2.5',
                  'focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
                  row.aggregated && 'opacity-60',
                  row.hidden && 'opacity-45',
                  row.locked && 'cursor-default',
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
                  {row.pd && (
                    <span
                      className="inline-flex h-4 shrink-0 items-center rounded-sm border border-border px-1 text-2xs font-semibold text-muted-foreground"
                      data-testid="powerx-ranking-pd"
                    >
                      P/D
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-right text-sm whitespace-nowrap tabular-nums',
                    aggregatedEmpty ? 'text-xs font-normal text-muted-foreground' : 'font-semibold',
                  )}
                  data-testid="powerx-ranking-value"
                >
                  {aggregatedEmpty ? t.aggregated : (row.valueText ?? '–')}
                </span>
                <span
                  className="text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                  data-testid="powerx-ranking-delta"
                >
                  {row.delta === 'best' ? t.best : row.delta}
                </span>
                {sub && (
                  <span className="col-span-3 col-start-3 text-xs leading-snug text-muted-foreground max-md:hidden">
                    {sub}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {hiddenRows.length > 0 && (
          <PowerXHiddenRowsToggle
            testId="powerx-ranking-hidden"
            count={hiddenRows.length}
            open={hiddenOpen}
            labels={t}
            onToggle={() => {
              setHiddenOpen(!hiddenOpen);
              track('powerx_ranking_hidden_toggled', {
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

/** The one quiet "+4 hidden · Show" row both rankings fold their hidden GPUs into. */
export function PowerXHiddenRowsToggle({
  testId,
  count,
  open,
  labels,
  onToggle,
}: {
  testId: string;
  count: number;
  open: boolean;
  labels: {
    hiddenCount: (n: number) => string;
    showHidden: string;
    collapseHidden: string;
  };
  onToggle: () => void;
}) {
  return (
    <li className="border-b border-border">
      <button
        type="button"
        aria-expanded={open}
        data-testid={testId}
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-1.5 py-2.5 pl-[30px] text-left text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <span className="tabular-nums">{labels.hiddenCount(count)}</span>
        <span aria-hidden>·</span>
        <span className="underline decoration-border underline-offset-2">
          {open ? labels.collapseHidden : labels.showHidden}
        </span>
      </button>
    </li>
  );
}

export interface PowerXAdvancedSwitch {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** The chart's advanced switches inside Filter (the old legend's advanced options). */
export function PowerXAdvancedSwitches({
  switches,
}: {
  switches: readonly PowerXAdvancedSwitch[];
}) {
  return (
    <div className="divide-y divide-border rounded-md border">
      {switches.map((item) => (
        <label
          key={item.id}
          htmlFor={item.id}
          className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm"
        >
          {item.label}
          <Switch
            id={item.id}
            data-testid={`${item.id}-switch`}
            checked={item.checked}
            onCheckedChange={item.onCheckedChange}
          />
        </label>
      ))}
    </div>
  );
}
