'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import type { GpuPowerSeriesResponse } from '@/components/gpu-power/power-series';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { useLocale } from '@/lib/i18n/use-locale';
import type { PowerXRole } from '../powerx/powerx-role';
import type { InferenceData } from '../types';
import {
  allGpuPool,
  runAttemptFromUrl,
  summarizeTraceWindow,
  telemetryNameForPoint,
  traceConfigLabel,
  traceLanes,
  tracePools,
  type PowerPoolRole,
  type PowerTimelineTrace,
} from '../utils/powerTimeline';

const STRINGS = {
  en: {
    title: 'Validated-Window Summary',
    trace: 'Hardware · config',
    run: 'Run · telemetry source',
    window: 'Window (s)',
    pool: 'Pool · GPUs',
    validated: 'Validated average (W/GPU)',
    peak: 'Peak 1-s pool power (W)',
    poolTdp: 'Pool TDP (W)',
    pools: { all: 'All GPUs', prefill: 'Prefill', decode: 'Decode' } satisfies Record<
      PowerPoolRole,
      string
    >,
    source: { database: 'database', github: 'GitHub artifact fallback' },
    attempt: (attempt: number) => `attempt ${attempt}`,
    unofficial: 'unofficial',
    noWindow: 'Not recorded',
  },
  zh: {
    title: '有效测量窗口汇总',
    trace: '硬件 · 配置',
    run: '运行 · 遥测来源',
    window: '窗口（秒）',
    pool: 'GPU 池 · GPU 数',
    validated: '有效窗口平均值（W/GPU）',
    peak: '池功耗 1 秒峰值（W）',
    poolTdp: '池 TDP（W）',
    pools: { all: '全部 GPU', prefill: '预填充', decode: '解码' } satisfies Record<
      PowerPoolRole,
      string
    >,
    source: { database: '数据库', github: 'GitHub 产物回退' },
    attempt: (attempt: number) => `第 ${attempt} 次尝试`,
    unofficial: '非官方',
    noWindow: '未记录',
  },
};

// Headers wrap inside the fixed-width columns.
const head = (label: string) => <span className="whitespace-normal">{label}</span>;

const watts = d3.format(',.0f');
const seconds = d3.format(',.0f');

const validatedWatts = (point: InferenceData, role: PowerPoolRole) =>
  (role === 'prefill'
    ? point.measuredPrefillAvgPower
    : role === 'decode'
      ? point.measuredDecodeAvgPower
      : point.measuredAvgPower
  )?.y ?? null;

export default function PowerTimelineSummary({
  traces,
  responses,
  colorOf,
  hardwareLabel,
  isOverlay,
  role = 'all',
}: {
  traces: readonly PowerTimelineTrace[];
  responses: ReadonlyMap<string, GpuPowerSeriesResponse>;
  colorOf: (trace: PowerTimelineTrace) => string;
  hardwareLabel: (point: InferenceData) => string;
  isOverlay: (point: InferenceData) => boolean;
  /** Under a GPU role only that role's pools (all GPUs too for split) get a row. */
  role?: PowerXRole;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const rows = useMemo(
    () =>
      traces.map((trace) => ({
        trace,
        summary: summarizeTraceWindow(
          trace,
          role === 'all'
            ? [allGpuPool(trace.series), ...tracePools(trace.series)]
            : traceLanes(trace.series, role),
        ),
      })),
    [traces, role],
  );
  const isPhone = useIsMobileViewport();
  if (isPhone) {
    return (
      <PowerTimelineSummaryCards
        rows={rows}
        responses={responses}
        colorOf={colorOf}
        hardwareLabel={hardwareLabel}
        isOverlay={isOverlay}
      />
    );
  }
  // One row per pool; the trace, run and window cells span the trace's pool rows.
  const poolRows: PoolRow[] = rows.flatMap(({ trace, summary }) =>
    summary.pools.map((pool) => ({ trace, summary, pool })),
  );
  const columns: DataTableColumn<PoolRow>[] = [
    {
      header: t.trace,
      headerContent: head(t.trace),
      className: 'w-1/5 align-top',
      spanGroup: true,
      sortValue: ({ trace }) => hardwareLabel(trace.point),
      cell: ({ trace }) => (
        <>
          <span style={{ color: colorOf(trace) }}>● </span>
          {hardwareLabel(trace.point)}
          <span className="block text-muted-foreground">
            {traceConfigLabel(trace.point)}
            {isOverlay(trace.point) ? ` · ${t.unofficial}` : ''}
          </span>
        </>
      ),
    },
    {
      header: t.run,
      headerContent: head(t.run),
      className: 'w-1/4 align-top',
      spanGroup: true,
      cell: ({ trace }) => {
        const name = telemetryNameForPoint(trace.point);
        const source = responses.get(trace.runId)?.source;
        return (
          <>
            <TraceRunLink trace={trace} />
            {/* The file name is provenance, not something to read in a table:
                one truncated line, full name on hover. */}
            <span
              className="block truncate text-muted-foreground"
              title={name ? `power_validation_${name}.json` : undefined}
            >
              {source ? `${t.source[source]} · ` : ''}
              {name ? `power_validation_${name}.json` : '—'}
            </span>
          </>
        );
      },
    },
    {
      header: t.window,
      headerContent: head(t.window),
      className: 'align-top',
      spanGroup: true,
      sortValue: ({ summary }) => summary.windowSeconds ?? Number.NEGATIVE_INFINITY,
      cell: ({ summary }) =>
        summary.windowSeconds === null ? t.noWindow : seconds(summary.windowSeconds),
    },
    {
      header: t.pool,
      headerContent: head(t.pool),
      className: 'align-top',
      cell: ({ pool }) => (
        <>
          {t.pools[pool.role]} · {pool.gpuCount}
        </>
      ),
    },
    {
      header: t.validated,
      headerContent: head(t.validated),
      className: 'align-top',
      cell: ({ trace, pool }) => {
        const validated = validatedWatts(trace.point, pool.role);
        return validated === null ? '—' : watts(validated);
      },
    },
    {
      header: t.peak,
      headerContent: head(t.peak),
      className: 'align-top',
      cell: ({ pool }) => (pool.peakWatts === null ? '—' : watts(pool.peakWatts)),
    },
    {
      header: t.poolTdp,
      headerContent: head(t.poolTdp),
      className: 'align-top',
      cell: ({ trace, pool }) => {
        const tdp = HW_REGISTRY[trace.point.hwKey.split('_')[0]]?.tdp ?? 0;
        return tdp > 0 ? watts(tdp * pool.gpuCount) : '—';
      },
    },
  ];
  return (
    <section className="min-w-0 space-y-2 px-1" data-testid="power-timeline-summary">
      <h3 className="text-sm font-medium">{t.title}</h3>
      <DataTable
        data={poolRows}
        columns={columns}
        testId="power-timeline-summary-table"
        analyticsPrefix="powerx_timeline_summary"
        searchable={false}
        columnPresets={false}
        paginated={false}
        rowGroupKey={(row) => row.trace.key}
        rowGroupAttributes={(row) => ({
          'data-testid': 'power-timeline-summary-trace',
          'data-trace': row.trace.key,
        })}
        rowAttributes={(row) => ({ 'data-testid': `power-timeline-summary-${row.pool.role}` })}
        scrollClassName="max-h-96"
        tableClassName="min-w-[48rem] table-fixed break-words text-xs"
      />
    </section>
  );
}

/** The trace's run link, then the attempt when the run was retried. */
function TraceRunLink({ trace }: { trace: PowerTimelineTrace }) {
  const t = STRINGS[useLocale()];
  const attempt = runAttemptFromUrl(trace.point.run_url);
  return (
    <>
      <a
        href={trace.point.run_url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted"
      >
        {`run ${trace.runId}`}
      </a>
      {attempt === null ? '' : ` · ${t.attempt(attempt)}`}
    </>
  );
}

interface SummaryRow {
  trace: PowerTimelineTrace;
  summary: ReturnType<typeof summarizeTraceWindow>;
}

interface PoolRow extends SummaryRow {
  pool: SummaryRow['summary']['pools'][number];
}

/**
 * Phone layout: a seven-column table cannot fit, so each trace is a card with its provenance on
 * top and one three-value row per GPU pool.
 */
function PowerTimelineSummaryCards({
  rows,
  responses,
  colorOf,
  hardwareLabel,
  isOverlay,
}: {
  rows: readonly SummaryRow[];
  responses: ReadonlyMap<string, GpuPowerSeriesResponse>;
  colorOf: (trace: PowerTimelineTrace) => string;
  hardwareLabel: (point: InferenceData) => string;
  isOverlay: (point: InferenceData) => boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  return (
    <section className="min-w-0 space-y-2 px-1" data-testid="power-timeline-summary">
      <h3 className="text-sm font-medium">{t.title}</h3>
      <ul className="space-y-2" data-testid="power-timeline-summary-cards">
        {rows.map(({ trace, summary }) => {
          const { point } = trace;
          const name = telemetryNameForPoint(point);
          const source = responses.get(trace.runId)?.source;
          const tdp = HW_REGISTRY[point.hwKey.split('_')[0]]?.tdp ?? 0;
          return (
            <li
              key={trace.key}
              className="min-w-0 rounded-lg border border-border/60 p-3 text-xs"
              data-testid="power-timeline-summary-trace"
              data-trace={trace.key}
            >
              <p className="text-sm">
                <span style={{ color: colorOf(trace) }}>● </span>
                {hardwareLabel(point)}
              </p>
              <p className="text-muted-foreground">
                {traceConfigLabel(point)}
                {isOverlay(point) ? ` · ${t.unofficial}` : ''}
              </p>
              <p className="mt-1">
                <TraceRunLink trace={trace} />
              </p>
              <p className="whitespace-nowrap">
                {t.window}:{' '}
                {summary.windowSeconds === null ? t.noWindow : seconds(summary.windowSeconds)}
              </p>
              <p
                className="truncate text-muted-foreground"
                title={name ? `power_validation_${name}.json` : undefined}
              >
                {source ? `${t.source[source]} · ` : ''}
                {name ? `power_validation_${name}.json` : '—'}
              </p>
              {summary.pools.map((pool) => {
                const validated = validatedWatts(point, pool.role);
                return (
                  <div
                    key={pool.role}
                    className="mt-2 border-t border-border/60 pt-2"
                    data-testid={`power-timeline-summary-${pool.role}`}
                  >
                    <p className="font-medium">
                      {t.pools[pool.role]} · {pool.gpuCount}
                    </p>
                    <dl className="mt-1 grid grid-cols-3 gap-x-3 tabular-nums">
                      {[
                        { key: 'validated', label: t.validated, value: validated },
                        { key: 'peak', label: t.peak, value: pool.peakWatts },
                        {
                          key: 'tdp',
                          label: t.poolTdp,
                          value: tdp > 0 ? tdp * pool.gpuCount : null,
                        },
                      ].map((cell) => (
                        <div key={cell.key} className="flex min-w-0 flex-col justify-between">
                          <dt className="text-muted-foreground">{cell.label}</dt>
                          <dd className="font-medium whitespace-nowrap">
                            {cell.value === null ? '—' : watts(cell.value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
