'use client';

import { Download } from 'lucide-react';
import { useMemo } from 'react';
import type { PowerPoolRole, PowerTimelineTrace } from '@/components/inference/utils/powerTimeline';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { track } from '@/lib/analytics/analytics';
import { isPersistedBenchmarkId } from '@/lib/benchmarks/benchmark-id';
import { useLocale } from '@/lib/i18n/use-locale';
import { NVL72_GPUS_PER_RACK } from '@/lib/power/load-swing-stats';
import { cn } from '@/lib/shared/utils';

import {
  formatLoadSwingWatts,
  loadSwingPercentTdp,
  loadSwingRows,
  type LoadSwingRow,
} from './load-swing-rows';
import { PowerBasisPill } from './PowerBasisPill';
import type { PowerXRole } from './powerx-role';

const STRINGS = {
  en: {
    title: 'Load swings',
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
    csvShort: 'CSV',
    jsonShort: 'JSON',
    perGpu: 'W per GPU: the mean of each 1 s sample across the config’s GPUs.',
    perRack: `kW per NVL72 rack: the per-GPU trace × ${NVL72_GPUS_PER_RACK}, assuming every GPU swings together (an upper bound).`,
    definitions:
      'Peak, min and the Δ and ramp columns use the whole run; mean, P5/P95 and volatility use the validated window; idle floor is P5 before serving starts.',
    gaps: (count: number) => `${count} telemetry gap${count === 1 ? '' : 's'} skipped`,
    noWindow: 'window not recorded',
    fixed: '1 s DCGM samples · single node · inference only · sub-second swings not captured',
    tdp: 'TDP',
    at: (conc: number) => `c${conc}`,
    lane: { prefill: 'Prefill workers', decode: 'Decode workers' },
    laneAll: (count: number) => `All ${count} GPU${count === 1 ? '' : 's'}`,
    aggregated: 'aggregated',
    perLane:
      'Under a GPU role each row is one lane: the per-GPU mean of that pool’s GPUs only (all GPUs for the context row). Aggregated runs keep one row across every GPU.',
  },
  zh: {
    title: '负载波动',
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
    csvShort: 'CSV',
    jsonShort: 'JSON',
    perGpu: '每 GPU 瓦数：该配置所有 GPU 每个 1 秒采样的均值。',
    perRack: `每 NVL72 机架 kW：每 GPU 曲线 × ${NVL72_GPUS_PER_RACK}，假设全部 GPU 同步波动（上限）。`,
    definitions:
      '峰值、最小值以及 Δ 与速率列使用整个运行；均值、P5/P95 与波动率使用有效测量窗口；空闲底线为服务开始前的 P5。',
    gaps: (count: number) => `跳过 ${count} 处遥测间断`,
    noWindow: '未记录测量窗口',
    fixed: '1 秒 DCGM 采样 · 单节点 · 仅推理 · 不包含亚秒级波动',
    tdp: 'TDP',
    at: (conc: number) => `c${conc}`,
    lane: { prefill: '预填充 worker', decode: '解码 worker' },
    laneAll: (count: number) => `全部 ${count} 个 GPU`,
    aggregated: '聚合',
    perLane:
      '选择 GPU 角色时每行对应一个分组：仅该池 GPU 的每 GPU 均值（参考行为全部 GPU）。聚合运行仍以全部 GPU 显示为一行。',
  },
} as const;

interface LoadSwingTraceRow extends LoadSwingRow {
  color: string;
  label: string;
}

function statsDownloadUrl(
  pointId: number,
  format: 'csv' | 'json',
  rack: boolean,
  pool: PowerPoolRole | undefined,
): string {
  const params = new URLSearchParams({ id: String(pointId), format });
  if (rack) params.set('scale', 'nvl72');
  if (pool && pool !== 'all') params.set('role', pool);
  return `/api/v1/gpu-metrics-point/stats?${params.toString()}`;
}

/**
 * The load-swing statistics of the Over time traces on PowerX, under the chart; the ×72 per
 * NVL72 rack switch that scales them lives in the chart legend.
 */
export function PowerLoadSwings({
  traces,
  colorOf,
  labelOf,
  role = 'all',
  rack,
}: {
  traces: readonly PowerTimelineTrace[];
  colorOf: (trace: PowerTimelineTrace) => string;
  labelOf: (trace: PowerTimelineTrace) => string;
  /** PowerX GPU role: one row per lane (prefill, decode, and all GPUs for split). */
  role?: PowerXRole;
  /** kW per NVL72 rack, set by the chart legend's switch. */
  rack: boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const isPhone = useIsMobileViewport();
  const rows = useMemo<LoadSwingTraceRow[]>(
    () =>
      loadSwingRows(traces, role).map((row) => ({
        ...row,
        color: colorOf(row.trace),
        label: labelOf(row.trace),
      })),
    [traces, colorOf, labelOf, role],
  );
  if (rows.length === 0) return null;
  const value = (watts: number | null) => formatLoadSwingWatts(watts, rack);
  const pctTdp = (watts: number, tdp: number) => {
    const pct = loadSwingPercentTdp(watts, tdp);
    return pct === null ? '' : ` · ${pct}% ${t.tdp}`;
  };
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
  const laneName = (lane: NonNullable<LoadSwingTraceRow['lane']>) =>
    lane.kind === 'aggregated'
      ? t.aggregated
      : lane.role === 'all'
        ? t.laneAll(lane.gpuCount)
        : t.lane[lane.role];
  const traceName = ({ trace, color, label, stats, lane }: LoadSwingTraceRow) => (
    <>
      {/* The pinned cell wraps by default; the dot, name and concurrency stay on one line. */}
      <span className="whitespace-nowrap">
        <span
          aria-hidden
          className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
          style={{ backgroundColor: color }}
        />
        <span className="font-medium">{label}</span>{' '}
        <span className="text-muted-foreground">{t.at(trace.point.conc)}</span>
      </span>
      {lane && (
        <span
          // The lane goes on its own line so the table fits the page width.
          className={cn(
            lane.kind === 'lane' ? 'ml-1' : 'ml-1 text-muted-foreground',
            'block pl-4 max-md:inline max-md:pl-0',
          )}
          data-testid="powerx-load-swings-lane"
          data-lane={lane.kind}
          data-pool={lane.role}
        >
          · {laneName(lane)}
        </span>
      )}
      {/* Notes go on their own line in the table, inline on phone cards. */}
      {stats.gapCount > 0 && (
        <span className="ml-1 block pl-4 text-muted-foreground max-md:inline max-md:pl-0">
          · {t.gaps(stats.gapCount)}
        </span>
      )}
      {stats.mean === null && (
        <span className="ml-1 block pl-4 text-muted-foreground max-md:inline max-md:pl-0">
          · {t.noWindow}
        </span>
      )}
    </>
  );
  const downloads = ({ trace, lane }: LoadSwingTraceRow) => {
    const id = trace.point.id;
    // The context and aggregated rows read every GPU, so they download the unfiltered stats.
    const pool = lane?.kind === 'lane' ? lane.role : undefined;
    return isPersistedBenchmarkId(id) ? (
      <>
        <a
          href={statsDownloadUrl(id, 'csv', rack, pool)}
          download
          data-testid="powerx-swings-csv"
          title={t.csv}
          className="inline-flex items-center gap-1 underline decoration-dotted hover:text-foreground"
          onClick={() =>
            track('inference_powerx_swings_exported', { format: 'csv', role: pool ?? 'all' })
          }
        >
          <Download className="size-3" aria-hidden />
          {t.csvShort}
        </a>
        {' · '}
        <a
          href={statsDownloadUrl(id, 'json', rack, pool)}
          download
          data-testid="powerx-swings-json"
          title={t.json}
          className="underline decoration-dotted hover:text-foreground"
          onClick={() =>
            track('inference_powerx_swings_exported', { format: 'json', role: pool ?? 'all' })
          }
        >
          {t.jsonShort}
        </a>
      </>
    ) : (
      '—'
    );
  };
  const statSort: Record<string, (stats: LoadSwingTraceRow['stats']) => number | null> = {
    peak: (stats) => stats.peak,
    min: (stats) => stats.min,
    idle: (stats) => stats.idleFloor,
    mean: (stats) => stats.mean,
    p5p95: (stats) => stats.p95,
    d1: (stats) => stats.maxDelta1s,
    d5: (stats) => stats.maxDelta5s,
    up: (stats) => stats.rampUpPerSecond,
    down: (stats) => stats.rampDownPerSecond,
    volatility: (stats) => stats.volatility,
  };
  // Headers come from the same stat list as the cells, so their order cannot drift.
  const statColumns = statCells(rows[0]).map((head, index): DataTableColumn<LoadSwingTraceRow> => ({
    header: head.label,
    headerContent:
      head.key === 'peak' ? (
        <>
          {head.label}
          <PowerBasisPill tag="gpu" />
        </>
      ) : undefined,
    align: 'right',
    className: 'align-top whitespace-nowrap',
    cell: (row) => statCells(row)[index].value,
    sortValue: (row) => statSort[head.key](row.stats) ?? Number.NEGATIVE_INFINITY,
  }));
  const columns: DataTableColumn<LoadSwingTraceRow>[] = [
    {
      header: t.trace,
      pinned: true,
      className: 'align-top whitespace-nowrap',
      cell: (row) => traceName(row),
      sortValue: (row) => row.label,
    },
    ...statColumns,
    {
      header: t.downloads,
      className: 'no-export align-top whitespace-nowrap',
      cell: (row) => downloads(row),
    },
  ];
  return (
    <section className="min-w-0 space-y-2 px-1 pb-2" data-testid="powerx-load-swings">
      <h3 className="text-sm font-medium">{t.title}</h3>
      {isPhone ? (
        // Eleven columns cannot fit a phone, so each trace gets its own row with a two-column stat grid.
        <ul className="divide-y divide-border/30" data-testid="powerx-load-swings-cards">
          {rows.map((row) => (
            <li
              key={row.key}
              className="py-3 text-xs tabular-nums"
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
              <p className="no-export mt-2 text-muted-foreground">{downloads(row)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          testId="powerx-load-swings-table"
          analyticsPrefix="powerx_load_swings"
          searchable={false}
          columnPresets={false}
          paginated={false}
          rowAttributes={() => ({ 'data-testid': 'powerx-load-swings-row' })}
          scrollClassName="max-h-96"
          // Twelve columns: tighter cells and wrapping headers keep the table inside the card.
          tableClassName="min-w-[64rem] text-xs [&_td]:px-2 [&_th]:px-2 [&_th]:whitespace-normal"
        />
      )}
      <p className="text-xs text-muted-foreground">
        {rack ? t.perRack : t.perGpu} {role !== 'all' && `${t.perLane} `}
        {t.definitions}
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
