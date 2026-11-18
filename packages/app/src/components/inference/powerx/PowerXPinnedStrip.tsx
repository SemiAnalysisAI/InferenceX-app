'use client';

import { ArrowRight } from 'lucide-react';
import type { MouseEvent } from 'react';

import { useInferenceActions } from '@/components/inference/InferenceContext';
import { getMeasuredMetricConfig } from '@/components/inference/measured-metric-config';
import type { InferenceData } from '@/components/inference/types';
import {
  usePowerXActivePoint,
  useSetPowerXActivePoint,
} from '@/components/inference/ui/powerx-surface';
import { powerBreakdownSeriesKey } from '@/components/inference/utils/power-breakdown';
import {
  POWER_TIMELINE_METRIC_KEY,
  requestPowerTraceFocus,
  traceKeyForPoint,
} from '@/components/inference/utils/powerTimeline';
import { powerTraceHref } from '@/components/inference/utils/tooltipUtils';
import { useUrlState } from '@/hooks/useUrlState';
import { track } from '@/lib/analytics/analytics';
import { getHardwareConfig } from '@/lib/catalog/constants';
import { useLocale } from '@/lib/i18n/use-locale';
import { modeledFacilityWattsPerGpu, modeledItWattsPerGpu } from '@/lib/power/power-basis';
import { getDisplayLabel } from '@/lib/shared/utils';

import { POWERX_QUIET_BUTTON } from './PowerXShell';
import type { PowerXRole } from './powerx-role';

const STRINGS = {
  en: {
    energy: 'Energy',
    gpu: 'GPU',
    it: 'IT',
    facility: 'Facility',
    average: 'Average',
    p75: 'P75',
    p90: 'P90',
    prefill: 'Prefill',
    decode: 'Decode',
    pools: 'Pools',
    aggregated: 'aggregated',
    w: 'W',
    wPerGpu: 'W/GPU',
    wTimes: (gpus: number) => `W × ${gpus}`,
    ofTdp: '% of TDP',
    perDenominator: {
      input: 'input token',
      output: 'output token',
      total: 'token',
      query: 'query',
    },
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s`,
    viewTrace: 'View power trace',
    seeBreakdown: 'See breakdown',
    unpin: 'Unpin',
  },
  zh: {
    energy: '能耗',
    gpu: 'GPU',
    it: 'IT',
    facility: '设施',
    average: '平均',
    p75: 'P75',
    p90: 'P90',
    prefill: 'Prefill',
    decode: 'Decode',
    pools: '资源池',
    aggregated: '聚合',
    w: 'W',
    wPerGpu: 'W/GPU',
    wTimes: (gpus: number) => `W × ${gpus}`,
    ofTdp: '% TDP',
    perDenominator: { input: '输入 token', output: '输出 token', total: 'token', query: '查询' },
    at: (conc: number, x: string) => `c${conc} · ${x} tok/s`,
    viewTrace: '查看功耗曲线',
    seeBreakdown: '查看分解',
    unpin: '取消固定',
  },
} as const;

type Strings = (typeof STRINGS)[keyof typeof STRINGS];

export interface PowerXPinnedCell {
  key: string;
  label: string;
  value: string;
  unit?: string;
}

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const wattsText = (value: number) => Math.round(value).toLocaleString('en-US');
const watt = (
  key: string,
  label: string,
  watts: number | null | undefined,
  unit: string,
): PowerXPinnedCell | null =>
  finite(watts) ? { key, label, value: wattsText(watts), unit } : null;

/**
 * The pinned strip's key numbers (mockup v3): Energy shows energy, GPU and facility W;
 * Power shows the plotted statistic, P90 as % of TDP and facility W. Under a GPU role a
 * disaggregated point shows each pool's W per GPU, an aggregated one says so instead of
 * a pool split. Missing figures are left out, never shown as 0.
 */
export function powerXPinnedCells(
  point: InferenceData,
  {
    tab,
    role,
    metric,
    value,
    t,
  }: {
    tab: 'energy' | 'draw';
    role: PowerXRole;
    metric: string;
    /** The plotted y value, formatted. */
    value: string;
    t: Strings;
  },
): PowerXPinnedCell[] {
  const config = getMeasuredMetricConfig(metric);
  const gpu = point.measuredAvgPower?.y;
  const facility = point.utilityModeledWatts?.y ?? modeledFacilityWattsPerGpu(point);
  const it = point.itModeledWatts?.y ?? modeledItWattsPerGpu(point);
  const plotted = (): PowerXPinnedCell | null => {
    if (!finite(point.y)) return null;
    if (config?.family === 'energy') {
      const unit = `${config.unit === 'wattHours' ? 'Wh' : 'J'}/${t.perDenominator[config.denominator]}`;
      return { key: 'energy', label: t.energy, value, unit };
    }
    if (config?.family === 'power') {
      const label = config.statistic === 'average' ? t.average : t[config.statistic];
      return { key: 'plotted', label, value, unit: config.display === 'tdp' ? t.ofTdp : t.w };
    }
    return null;
  };
  const pool = (name: 'prefill' | 'decode') => {
    const gpus = name === 'prefill' ? point.num_prefill_gpu : point.num_decode_gpu;
    return watt(
      name,
      t[name],
      name === 'prefill' ? point.measuredPrefillAvgPower?.y : point.measuredDecodeAvgPower?.y,
      finite(gpus) ? t.wTimes(gpus) : t.wPerGpu,
    );
  };
  const p90 = (): PowerXPinnedCell | null => {
    const watts = point.measuredP90Power?.y;
    const pct = point.measuredPowerPercentTdp?.y;
    // % of TDP is reported for the average; P90 scales by the same TDP.
    if (!finite(watts) || !finite(pct) || !finite(gpu) || gpu <= 0) return null;
    if (config?.family === 'power' && config.display === 'tdp') return null;
    return {
      key: 'p90',
      label: t.p90,
      value: String(Math.round((watts * pct) / gpu)),
      unit: t.ofTdp,
    };
  };
  const facilityCell = watt('facility', t.facility, facility, t.wPerGpu);
  let cells: (PowerXPinnedCell | null)[];
  if (role === 'all') {
    cells =
      tab === 'energy'
        ? [plotted(), watt('gpu', t.gpu, gpu, t.w), facilityCell]
        : [plotted(), p90(), facilityCell];
  } else if (point.disagg) {
    cells = [
      pool('prefill'),
      pool('decode'),
      tab === 'energy' ? plotted() : watt('it', t.it, it, t.wPerGpu),
    ];
  } else {
    cells = [watt('gpu', t.gpu, gpu, t.w), { key: 'pools', label: t.pools, value: t.aggregated }];
  }
  return cells.filter((cell): cell is PowerXPinnedCell => cell !== null);
}

/**
 * The pinned-point strip under the Energy and Power charts: the point, its key numbers
 * and quiet actions. View power trace opens Over time on the point's trace (the role and
 * the focus carry over, as the tooltip action does); See breakdown opens Where with the
 * point compared.
 */
export function PowerXPinnedStrip({
  tab,
  role,
  metric,
  formatValue,
  onSeeBreakdown,
}: {
  tab: 'energy' | 'draw';
  role: PowerXRole;
  metric: string;
  formatValue: (point: InferenceData) => string;
  onSeeBreakdown: () => void;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const active = usePowerXActivePoint();
  const setActivePoint = useSetPowerXActivePoint();
  const { setSelectedYAxisMetric } = useInferenceActions();
  const { setUrlParams } = useUrlState();
  if (active?.source !== 'pinned') return null;
  const { point } = active;
  const traceKey = traceKeyForPoint(point);
  const cells = powerXPinnedCells(point, { tab, role, metric, value: formatValue(point), t });
  const gpu = String(point.hwKey);
  const openTrace = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!traceKey) return;
    // A modified click opens the link in a new tab; a plain one switches in place.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    requestPowerTraceFocus(traceKey);
    setSelectedYAxisMetric(POWER_TIMELINE_METRIC_KEY);
    track('powerx_pinned_trace_opened', { gpu, conc: point.conc });
  };
  return (
    <div
      className="mt-2 flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 py-2"
      data-testid="powerx-pinned"
    >
      <span className="inline-flex min-w-0 items-center gap-2 text-sm whitespace-nowrap">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: active.color ?? 'currentColor' }}
          aria-hidden
        />
        <span className="font-semibold">
          {getDisplayLabel(getHardwareConfig(point.hwKey, point.model))}
        </span>
        <span className="text-xs text-muted-foreground">
          {t.at(point.conc, Math.round(point.x).toLocaleString('en-US'))}
        </span>
      </span>
      <span className="inline-flex flex-wrap gap-x-6 gap-y-1">
        {cells.map((cell) => (
          <span
            key={cell.key}
            className="inline-flex items-baseline gap-1.5 text-sm whitespace-nowrap"
            data-testid={`powerx-pinned-${cell.key}`}
          >
            <span className="text-2xs tracking-wider text-muted-foreground uppercase">
              {cell.label}
            </span>
            <span className="font-semibold tabular-nums">{cell.value}</span>
            {cell.unit && <span className="text-xs text-muted-foreground">{cell.unit}</span>}
          </span>
        ))}
      </span>
      <span className="-mr-2 flex max-md:-ml-2 max-md:w-full md:ml-auto">
        {traceKey && (
          <a
            href={powerTraceHref(point)}
            className={POWERX_QUIET_BUTTON}
            data-testid="powerx-pinned-trace"
            onClick={openTrace}
          >
            {t.viewTrace}
            <ArrowRight className="size-3.5 opacity-60" aria-hidden />
          </a>
        )}
        <button
          type="button"
          className={POWERX_QUIET_BUTTON}
          data-testid="powerx-pinned-breakdown"
          onClick={() => {
            setUrlParams({ i_pbpoint: `${powerBreakdownSeriesKey(point)}:${point.conc}` });
            onSeeBreakdown();
            track('powerx_pinned_breakdown_opened', { gpu, conc: point.conc });
          }}
        >
          {t.seeBreakdown}
          <ArrowRight className="size-3.5 opacity-60" aria-hidden />
        </button>
        <button
          type="button"
          className={POWERX_QUIET_BUTTON}
          data-testid="powerx-pinned-unpin"
          onClick={() => {
            setActivePoint?.('clear');
            track('powerx_unpinned', { gpu, conc: point.conc });
          }}
        >
          {t.unpin}
        </button>
      </span>
    </div>
  );
}
