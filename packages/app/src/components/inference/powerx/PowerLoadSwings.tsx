'use client';

import { Download, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import type { InferenceData } from '@/components/inference/types';
import type { PowerTimelineTrace } from '@/components/inference/utils/powerTimeline';
import { Switch } from '@/components/ui/switch';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  loadSwingStatsFromSeries,
  NVL72_GPUS_PER_RACK,
  type LoadSwingStats,
} from '@/lib/power/load-swing-stats';

import { PowerBasisPill } from './PowerBasisPill';

const STRINGS = {
  en: {
    title: 'Load swings',
    rack: `× ${NVL72_GPUS_PER_RACK} per NVL72 rack`,
    rackHelp: `Multiplies the per-GPU trace by ${NVL72_GPUS_PER_RACK} and shows kW per rack. Assumes all ${NVL72_GPUS_PER_RACK} GPUs swing together, so it is an upper bound on rack-level swings.`,
    trace: 'Trace',
    peak: 'Peak',
    min: 'Min',
    idle: 'Idle floor',
    mean: 'Mean',
    p5p95: 'P5 / P95',
    d1: 'Max Δ1s',
    d5: 'Max Δ5s',
    up: 'Ramp up',
    down: 'Ramp down',
    volatility: 'Volatility',
    downloads: 'Download',
    csv: 'CSV (1 s trace)',
    json: 'stats (JSON)',
    perGpu: 'W per GPU: the mean of each 1 s sample across the config’s GPUs.',
    perRack: `kW per NVL72 rack: the per-GPU trace × ${NVL72_GPUS_PER_RACK}, assuming every GPU swings together (an upper bound).`,
    definitions:
      'Peak, min and the Δ and ramp columns use the whole run; mean, P5/P95 and volatility use the validated window; idle floor is P5 before serving starts.',
    gaps: (count: number) => `${count} telemetry gap${count === 1 ? '' : 's'} skipped`,
    noWindow: 'window not recorded',
    fixed: '1 s DCGM samples · single node · inference only · sub-second swings not captured',
    tdp: 'TDP',
    at: (conc: number) => `c${conc}`,
  },
  zh: {
    title: '负载波动',
    rack: `× ${NVL72_GPUS_PER_RACK}（每 NVL72 机架）`,
    rackHelp: `将每 GPU 曲线乘以 ${NVL72_GPUS_PER_RACK}，以每机架 kW 显示。假设全部 ${NVL72_GPUS_PER_RACK} 颗 GPU 同步波动，因此是机架级波动的上限。`,
    trace: '曲线',
    peak: '峰值',
    min: '最小值',
    idle: '空闲底线',
    mean: '均值',
    p5p95: 'P5 / P95',
    d1: '最大 Δ1s',
    d5: '最大 Δ5s',
    up: '上升速率',
    down: '下降速率',
    volatility: '波动率',
    downloads: '下载',
    csv: 'CSV（1 秒曲线）',
    json: '统计（JSON）',
    perGpu: '每 GPU 瓦数：该配置所有 GPU 每个 1 秒采样的均值。',
    perRack: `每 NVL72 机架 kW：每 GPU 曲线 × ${NVL72_GPUS_PER_RACK}，假设全部 GPU 同步波动（上限）。`,
    definitions:
      '峰值、最小值以及 Δ 与速率列使用整个运行；均值、P5/P95 与波动率使用有效测量窗口；空闲底线为服务开始前的 P5。',
    gaps: (count: number) => `跳过 ${count} 处遥测间断`,
    noWindow: '未记录测量窗口',
    fixed: '1 秒 DCGM 采样 · 单节点 · 仅推理 · 不包含亚秒级波动',
    tdp: 'TDP',
    at: (conc: number) => `c${conc}`,
  },
} as const;

interface LoadSwingTraceRow {
  trace: PowerTimelineTrace;
  color: string;
  label: string;
  stats: LoadSwingStats;
  tdpWatts: number;
}

/** Statistics of every visible trace; traces without usable samples are left out. */
function loadSwingRows(
  traces: readonly PowerTimelineTrace[],
  colorOf: (trace: PowerTimelineTrace) => string,
  labelOf: (point: InferenceData) => string,
): LoadSwingTraceRow[] {
  return traces.flatMap((trace) => {
    const stats = loadSwingStatsFromSeries(trace.series, trace.windowStartMs, trace.windowEndMs);
    if (!stats) return [];
    return [
      {
        trace,
        color: colorOf(trace),
        label: labelOf(trace.point),
        stats,
        tdpWatts: HW_REGISTRY[trace.point.hwKey.split('_')[0]]?.tdp ?? 0,
      },
    ];
  });
}

function statsDownloadUrl(pointId: number, format: 'csv' | 'json', rack: boolean): string {
  const params = new URLSearchParams({ id: String(pointId), format });
  if (rack) params.set('scale', 'nvl72');
  return `/api/v1/gpu-metrics-point/stats?${params.toString()}`;
}

/** The load-swing statistics row above the Over time chart on PowerX. */
export function PowerLoadSwings({
  traces,
  colorOf,
  labelOf,
}: {
  traces: readonly PowerTimelineTrace[];
  colorOf: (trace: PowerTimelineTrace) => string;
  labelOf: (point: InferenceData) => string;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const [rack, setRack] = useState(false);
  const isPhone = useIsMobileViewport();
  const rows = useMemo(() => loadSwingRows(traces, colorOf, labelOf), [traces, colorOf, labelOf]);
  if (rows.length === 0) return null;
  const unit = rack ? 'kW' : 'W';
  const value = (watts: number | null) => {
    if (watts === null) return '—';
    const scaled = rack ? (watts * NVL72_GPUS_PER_RACK) / 1000 : watts;
    return `${rack ? Number(scaled.toPrecision(3)).toLocaleString('en-US') : Math.round(scaled).toLocaleString('en-US')} ${unit}`;
  };
  const pctTdp = (watts: number, tdp: number) =>
    tdp > 0 ? ` · ${Math.round((watts / tdp) * 100)}% ${t.tdp}` : '';
  // One column list feeds both the desktop table and the phone cards, so they cannot drift.
  const statCells = ({ stats, tdpWatts }: LoadSwingTraceRow) => [
    { key: 'peak', label: t.peak, value: value(stats.peak) },
    { key: 'min', label: t.min, value: value(stats.min) },
    { key: 'idle', label: t.idle, value: value(stats.idleFloor) },
    { key: 'mean', label: t.mean, value: value(stats.mean) },
    { key: 'p5p95', label: t.p5p95, value: `${value(stats.p5)} / ${value(stats.p95)}` },
    {
      key: 'd1',
      label: t.d1,
      value: `${value(stats.maxDelta1s)}${pctTdp(stats.maxDelta1s, tdpWatts)}`,
    },
    {
      key: 'd5',
      label: t.d5,
      value: `${value(stats.maxDelta5s)}${pctTdp(stats.maxDelta5s, tdpWatts)}`,
    },
    { key: 'up', label: t.up, value: `${value(stats.rampUpPerSecond)}/s` },
    { key: 'down', label: t.down, value: `${value(stats.rampDownPerSecond)}/s` },
    {
      key: 'volatility',
      label: t.volatility,
      value: stats.volatility === null ? '—' : `${(stats.volatility * 100).toFixed(1)}%`,
    },
  ];
  const traceName = ({ trace, color, label, stats }: LoadSwingTraceRow) => (
    <>
      <span
        aria-hidden
        className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
        style={{ backgroundColor: color }}
      />
      <span className="font-medium">{label}</span>{' '}
      <span className="text-muted-foreground">{t.at(trace.point.conc)}</span>
      {stats.gapCount > 0 && (
        <span className="ml-1 text-muted-foreground">· {t.gaps(stats.gapCount)}</span>
      )}
      {stats.mean === null && <span className="ml-1 text-muted-foreground">· {t.noWindow}</span>}
    </>
  );
  const downloads = (id: number | undefined) =>
    isPersistedBenchmarkId(id) ? (
      <>
        <a
          href={statsDownloadUrl(id, 'csv', rack)}
          download
          data-testid="powerx-swings-csv"
          className="inline-flex items-center gap-1 underline decoration-dotted hover:text-foreground"
          onClick={() => track('inference_powerx_swings_exported', { format: 'csv' })}
        >
          <Download className="size-3" aria-hidden />
          {t.csv}
        </a>
        {' · '}
        <a
          href={statsDownloadUrl(id, 'json', rack)}
          download
          data-testid="powerx-swings-json"
          className="underline decoration-dotted hover:text-foreground"
          onClick={() => track('inference_powerx_swings_exported', { format: 'json' })}
        >
          {t.json}
        </a>
      </>
    ) : (
      '—'
    );
  return (
    <section className="min-w-0 space-y-2 px-1 pb-2" data-testid="powerx-load-swings">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-sm font-medium">{t.title}</h3>
        <label className="flex min-h-11 items-center gap-2 text-xs md:min-h-8">
          <Switch
            checked={rack}
            onCheckedChange={(checked) => {
              setRack(checked);
              track('inference_powerx_swings_rack_toggled', { enabled: checked });
            }}
            data-testid="powerx-swings-rack"
          />
          <span>{t.rack}</span>
          <span
            title={t.rackHelp}
            className="text-muted-foreground"
            data-testid="powerx-swings-rack-help"
          >
            <Info className="size-3.5" aria-label={t.rackHelp} />
          </span>
        </label>
      </div>
      {isPhone ? (
        // Eleven columns cannot fit a phone: one card per trace with a two-column stat grid.
        <ul className="space-y-2" data-testid="powerx-load-swings-cards">
          {rows.map((row) => (
            <li
              key={row.trace.key}
              className="rounded-lg border border-border/60 p-3 text-xs tabular-nums"
              data-testid="powerx-load-swings-row"
            >
              <p className="text-sm">{traceName(row)}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                {statCells(row).map((cell) => (
                  <div key={cell.key} className="min-w-0" data-stat={cell.key}>
                    <dt className="text-muted-foreground">{cell.label}</dt>
                    <dd className="font-medium whitespace-nowrap">{cell.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="no-export mt-2 border-t border-border/60 pt-2 text-muted-foreground">
                {downloads(row.trace.point.id)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="max-h-96 min-w-0 overflow-auto">
          <table
            className="w-full min-w-[64rem] text-left text-xs tabular-nums"
            data-testid="powerx-load-swings-table"
          >
            <thead className="sticky top-0 bg-background">
              <tr>
                <th className="p-2">{t.trace}</th>
                <th className="p-2">
                  {t.peak}
                  <PowerBasisPill tag="gpu" />
                </th>
                <th className="p-2">{t.min}</th>
                <th className="p-2">{t.idle}</th>
                <th className="p-2">{t.mean}</th>
                <th className="p-2">{t.p5p95}</th>
                <th className="p-2">{t.d1}</th>
                <th className="p-2">{t.d5}</th>
                <th className="p-2">{t.up}</th>
                <th className="p-2">{t.down}</th>
                <th className="p-2">{t.volatility}</th>
                <th className="p-2 no-export">{t.downloads}</th>
              </tr>
            </thead>
            <tbody className="border-t">
              {rows.map((row) => (
                <tr key={row.trace.key} data-testid="powerx-load-swings-row">
                  <th className="p-2 align-top font-normal whitespace-nowrap">{traceName(row)}</th>
                  {statCells(row).map((cell) => (
                    <td key={cell.key} className="p-2 align-top whitespace-nowrap">
                      {cell.value}
                    </td>
                  ))}
                  <td className="no-export p-2 align-top whitespace-nowrap">
                    {downloads(row.trace.point.id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {rack ? t.perRack : t.perGpu} {t.definitions}
        <PowerBasisPill tag="gpu" />
      </p>
    </section>
  );
}

/** The fixed caveat line under the Over time chart. */
export function PowerLoadSwingsCaveat() {
  const locale = useLocale();
  return (
    <p className="px-1 text-xs text-muted-foreground" data-testid="powerx-swings-caveat">
      {STRINGS[locale].fixed}
    </p>
  );
}
