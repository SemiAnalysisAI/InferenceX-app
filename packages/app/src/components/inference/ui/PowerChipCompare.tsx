'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useState } from 'react';

import { Heading } from '@/components/ui/heading';
import { useThemeColors } from '@/hooks/useThemeColors';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import type { AggDataEntry, InferenceData } from '../types';
import { swatchStyle } from './PowerBreakdownPanel';
import {
  breakdownItWattsPerGpu,
  breakdownSeriesAtBoundary,
  buildPowerBreakdowns,
  compareBreakdownsAt,
  defaultComparisonInteractivity,
  MEASURED_POWER_CATEGORIES,
  POWER_BREAKDOWN_STACK_ORDER,
  powerBreakdownInteractivity,
  type SystemPowerCategory,
} from '../utils/power-breakdown';
import { chipsWithoutSystemModel } from '../utils/power-chip-coverage';
import { PowerBasisPill } from '../powerx/PowerBasisPill';
import { IT_NOT_MODELED_NOTE } from '@/lib/power/power-basis';
import {
  usePowerXCompareTarget,
  usePowerXIncludeFacility,
  useSetPowerXCompareTarget,
} from './powerx-surface';

const STRINGS = {
  en: {
    title: 'Compare chips at one interactivity',
    subtitle: 'Each bar is one chip’s point nearest the chosen interactivity.',
    target: 'Interactivity',
    unit: 'tok/s/user',
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    gpuShare: (pct: string) => `GPU ${pct}`,
    outOfRange: (labels: string) => `Not benchmarked near this interactivity: ${labels}`,
    measured: 'Measured',
    modeled: 'Modeled (hatched)',
    perGpu: 'W per GPU, all-in',
    perGpuIt: 'W per GPU, IT (no PUE)',
    itSubtotal: (watts: string) => `IT ${watts} W`,
    empty: 'No chip has a benchmark point near this interactivity.',
    noModel: (labels: string) =>
      `Not shown: ${labels}. Its GPU power is measured, but there is no whole-system model for this setup yet.`,
    categories: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      server: 'Server parts',
      fansPsu: 'Fans + PSU loss',
      network: 'Network share',
      facility: 'Facility (PUE)',
    } satisfies Record<SystemPowerCategory, string>,
  },
  zh: {
    title: '在同一交互性下对比芯片',
    subtitle: '每条横条为该芯片最接近所选交互性的基准测试点。',
    target: '交互性',
    unit: 'tok/s/user',
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s/user`,
    gpuShare: (pct: string) => `GPU ${pct}`,
    outOfRange: (labels: string) => `未在该交互性附近测试：${labels}`,
    measured: '实测',
    modeled: '建模（斜线）',
    perGpu: '每 GPU 整体功耗（W）',
    perGpuIt: '每 GPU IT 功耗（W，不含 PUE）',
    itSubtotal: (watts: string) => `IT ${watts} W`,
    empty: '没有芯片在该交互性附近有基准测试点。',
    noModel: (labels: string) => `未显示：${labels}。其 GPU 功耗为实测，但该配置暂无整机功耗模型。`,
    categories: {
      gpu: 'GPU',
      measuredCpu: 'Grace CPU',
      server: '服务器部件',
      fansPsu: '风扇 + 电源损耗',
      network: '网络分摊',
      facility: '机房开销（PUE）',
    } satisfies Record<SystemPowerCategory, string>,
  },
};

const watts = d3.format(',.0f');
const pct = d3.format('.0%');
const rate = d3.format(',.0f');
const SLIDER_STEPS = 200;
const MIN_LABEL_SHARE = 0.08;

export default function PowerChipCompare({
  data,
  xField,
  selectedKey,
  onSelectKey,
  compact = false,
  expandedKey = null,
  renderExpanded,
}: {
  data: InferenceData[];
  xField?: keyof AggDataEntry;
  selectedKey: string | null;
  onSelectKey: (key: string) => void;
  /** PowerX v2: no heading, the view tab names the chart; the slider is the first row. */
  compact?: boolean;
  /** Series whose drill-down renders inline under its bar (PowerX v2). */
  expandedKey?: string | null;
  renderExpanded?: (key: string) => React.ReactNode;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const interactivity = useMemo(() => powerBreakdownInteractivity(xField), [xField]);
  // PowerX counts IT only until Include facility is on; elsewhere the facility meter.
  const includeFacility = usePowerXIncludeFacility();
  const series = useMemo(
    () =>
      buildPowerBreakdowns(data, locale, interactivity).map((entry) =>
        breakdownSeriesAtBoundary(entry, includeFacility),
      ),
    [data, locale, interactivity, includeFacility],
  );
  const unmodeled = useMemo(() => chipsWithoutSystemModel(data, series), [data, series]);
  const hwKeys = useMemo(() => [...new Set(series.map((entry) => entry.hwKey))], [series]);
  const { resolveColor } = useThemeColors({
    highContrast: false,
    identifiers: hwKeys,
    activeKeys: hwKeys,
  });

  const [lo, hi] = useMemo(() => {
    const xs = series.flatMap((entry) => entry.points.map((point) => point.interactivity));
    return xs.length > 0 ? [Math.min(...xs), Math.max(...xs)] : [1, 1];
  }, [series]);
  const fallback = useMemo(() => defaultComparisonInteractivity(series), [series]);
  // On PowerX the target is shared with the drill-down and the main chart.
  const sharedTarget = usePowerXCompareTarget();
  const setSharedTarget = useSetPowerXCompareTarget();
  const [ownTarget, setOwnTarget] = useState<number | null>(null);
  const target = setSharedTarget ? sharedTarget : ownTarget;
  const setTarget = setSharedTarget ?? setOwnTarget;
  // A new model or scenario changes the range; return to the shared middle.
  useEffect(() => setTarget(null), [lo, hi, setTarget]);
  const value = target ?? fallback;

  const { rows, outOfRange } = useMemo(
    () => (value ? compareBreakdownsAt(series, value) : { rows: [], outOfRange: [] }),
    [series, value],
  );
  const maxTotal = Math.max(1, ...rows.map((row) => row.entry.totalWattsPerGpu));
  const categories = POWER_BREAKDOWN_STACK_ORDER.filter((key) =>
    rows.some((row) => row.entry.wattsPerGpu[key] > 0),
  );
  // No chip in this selection has a whole-system model: say so instead of leaving a gap.
  if (series.length === 0 || value === null) {
    return (
      <section className="min-w-0 space-y-3" data-testid="power-chip-compare">
        <p className="py-4 text-sm text-muted-foreground">{t.empty}</p>
        {unmodeled.length > 0 && (
          <p
            className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
            data-testid="power-chip-compare-unmodeled"
          >
            {t.noModel(unmodeled.join(', '))}
          </p>
        )}
      </section>
    );
  }

  const toStep = (x: number) =>
    hi > lo ? Math.round((Math.log(x / lo) / Math.log(hi / lo)) * SLIDER_STEPS) : 0;
  const fromStep = (step: number) => lo * (hi / lo) ** (step / SLIDER_STEPS);

  return (
    <section className="min-w-0 space-y-3" data-testid="power-chip-compare">
      {!compact && (
        <div className="space-y-1">
          <Heading as="h3" level="card">
            {t.title}
          </Heading>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
      )}

      <div className="no-export flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex min-w-0 flex-1 basis-72 items-center gap-3 text-sm">
          <span className="shrink-0 font-medium text-muted-foreground">{t.target}</span>
          <input
            type="range"
            min={0}
            max={SLIDER_STEPS}
            value={toStep(value)}
            onChange={(event) => setTarget(fromStep(Number(event.target.value)))}
            onPointerUp={() => track('inference_power_compare_target_changed')}
            className="min-w-0 flex-1 accent-secondary dark:accent-primary"
            data-testid="power-chip-compare-target"
            aria-valuetext={`${rate(value)} ${t.unit}`}
          />
          <span
            className="shrink-0 tabular-nums font-medium"
            data-testid="power-chip-compare-value"
          >
            {rate(value)} {t.unit}
          </span>
        </label>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        {categories.map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              className="inline-block size-3 rounded-[2px] border border-muted-foreground/60"
              style={swatchStyle(key, 'var(--muted-foreground)')}
            />
            {t.categories[key]}
            <span className="opacity-70">
              · {MEASURED_POWER_CATEGORIES.has(key) ? t.measured : t.modeled}
            </span>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ol className="space-y-1.5" data-testid="power-chip-compare-rows">
          {rows.map(({ series: entry, entry: point }) => {
            const color = resolveColor(entry.hwKey);
            const active = entry.key === selectedKey;
            const expanded = renderExpanded !== undefined && entry.key === expandedKey;
            const gpuShare = point.wattsPerGpu.gpu / point.totalWattsPerGpu;
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => {
                    onSelectKey(entry.key);
                    track('inference_power_compare_chip_selected');
                  }}
                  aria-pressed={active}
                  aria-expanded={renderExpanded ? expanded : undefined}
                  data-testid="power-chip-compare-row"
                  className={`grid w-full grid-cols-1 items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left transition-colors sm:grid-cols-[12rem_minmax(0,1fr)_5.5rem] ${
                    active ? 'bg-muted/60 ring-1 ring-border' : 'hover:bg-muted/40'
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate">{entry.label}</span>
                    </span>
                    <span className="pl-4.5 text-xs text-muted-foreground">
                      {t.at(point.concurrency, rate(point.interactivity))}
                    </span>
                  </span>
                  <span className="flex h-7 min-w-0 items-stretch overflow-hidden rounded-sm">
                    <span
                      className="flex h-full"
                      style={{ width: `${(point.totalWattsPerGpu / maxTotal) * 100}%` }}
                    >
                      {categories.map((key) => {
                        const w = point.wattsPerGpu[key];
                        if (!(w > 0)) return null;
                        const share = w / maxTotal;
                        return (
                          <span
                            key={key}
                            title={`${t.categories[key]}: ${watts(w)} W`}
                            className="flex h-full items-center justify-center border-r border-background/70 text-2xs font-medium tabular-nums text-foreground last:border-r-0"
                            style={{
                              width: `${(w / point.totalWattsPerGpu) * 100}%`,
                              ...swatchStyle(key, color),
                            }}
                          >
                            {share >= MIN_LABEL_SHARE ? watts(w) : ''}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                  <span className="flex flex-col text-right sm:items-end">
                    <span className="text-sm font-semibold tabular-nums">
                      {watts(point.totalWattsPerGpu)} W
                      <PowerBasisPill tag={includeFacility ? 'facility' : 'it'} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {includeFacility
                        ? `${t.itSubtotal(watts(breakdownItWattsPerGpu(point)))} · `
                        : ''}
                      {t.gpuShare(pct(gpuShare))}
                    </span>
                  </span>
                </button>
                {expanded && (
                  <div
                    className="mt-1.5 mb-3 rounded-md border border-border/60 p-3"
                    data-testid="power-chip-compare-drilldown"
                  >
                    {renderExpanded(entry.key)}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">
        {includeFacility ? t.perGpu : t.perGpuIt}
        {outOfRange.length > 0 &&
          ` · ${t.outOfRange(outOfRange.map((entry) => entry.label).join(', '))}`}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="power-chip-compare-not-modeled">
        {IT_NOT_MODELED_NOTE[locale]}
      </p>
      {unmodeled.length > 0 && (
        <p
          className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
          data-testid="power-chip-compare-unmodeled"
        >
          {t.noModel(unmodeled.join(', '))}
        </p>
      )}
    </section>
  );
}
