'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';
import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import type { GpuPowerSeriesResponse } from '@/components/gpu-power/power-series';
import { useLocale } from '@/lib/use-locale';
import type { InferenceData } from '../types';
import {
  allGpuPool,
  runAttemptFromUrl,
  summarizeTraceWindow,
  telemetryNameForPoint,
  traceConfigLabel,
  tracePools,
  type PowerPoolRole,
  type PowerTimelineTrace,
} from '../utils/powerTimeline';

const STRINGS = {
  en: {
    title: 'Validated-window summary',
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
    method: (bucket: number | null) =>
      `Validated averages are the benchmark row’s figures, not recomputed here. Peak is the highest ${bucket === null ? '' : `${bucket}-s `}sum of the pool’s GPUs inside the recorded validated window, as drawn; buckets missing a pool GPU are skipped. Pool TDP = GPUs × rated TDP from the hardware registry. The telemetry source is per run: database when every requested series was stored, GitHub artifact fallback when any had to be read live.`,
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
    method: (bucket: number | null) =>
      `有效窗口平均值取自基准测试记录，此处不重新计算。峰值是在已记录的有效测量窗口内，${bucket === null ? '' : `按 ${bucket} 秒区间`}对该池各 GPU 功耗求和后的最大值，与图中曲线一致；缺少任一 GPU 采样的区间不计入。池 TDP = GPU 数 × 硬件注册表中的额定 TDP。遥测来源按运行标注：所有请求的序列都已入库时为数据库；只要有序列需要实时读取，就标为 GitHub 产物回退。`,
  },
};

const watts = d3.format(',.0f');
const seconds = d3.format(',.0f');

const validatedWatts = (point: InferenceData, role: PowerPoolRole) =>
  (role === 'prefill'
    ? point.measuredPrefillAvgPower
    : role === 'decode'
      ? point.measuredDecodeAvgPower
      : point.measuredAvgPower
  )?.y ?? null;

/**
 * Per-trace provenance behind the Timeline curves: which run and telemetry file
 * each trace came from, the validated window length, and per pool its GPU
 * count, the row's validated average, the drawn peak and the rated pool TDP.
 */
export default function PowerTimelineSummary({
  traces,
  responses,
  colorOf,
  hardwareLabel,
  isOverlay,
}: {
  traces: readonly PowerTimelineTrace[];
  responses: ReadonlyMap<string, GpuPowerSeriesResponse>;
  colorOf: (trace: PowerTimelineTrace) => string;
  hardwareLabel: (point: InferenceData) => string;
  isOverlay: (point: InferenceData) => boolean;
}) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const rows = useMemo(
    () =>
      traces.map((trace) => ({
        trace,
        summary: summarizeTraceWindow(trace, [
          allGpuPool(trace.series),
          ...tracePools(trace.series),
        ]),
      })),
    [traces],
  );
  const buckets = [...new Set(rows.map((row) => row.summary.bucketSeconds))];
  return (
    <section className="min-w-0 space-y-2 px-1" data-testid="power-timeline-summary">
      <h3 className="text-sm font-medium">{t.title}</h3>
      <div className="max-h-96 min-w-0 overflow-auto">
        <table className="w-full min-w-[48rem] table-fixed break-words text-left text-xs">
          <thead className="sticky top-0 bg-background">
            <tr>
              <th className="w-1/5 p-2">{t.trace}</th>
              <th className="w-1/4 p-2">{t.run}</th>
              <th className="p-2">{t.window}</th>
              <th className="p-2">{t.pool}</th>
              <th className="p-2">{t.validated}</th>
              <th className="p-2">{t.peak}</th>
              <th className="p-2">{t.poolTdp}</th>
            </tr>
          </thead>
          {rows.map(({ trace, summary }) => {
            const { point } = trace;
            const attempt = runAttemptFromUrl(point.run_url);
            const name = telemetryNameForPoint(point);
            const source = responses.get(trace.runId)?.source;
            const tdp = HW_REGISTRY[point.hwKey.split('_')[0]]?.tdp ?? 0;
            return (
              <tbody
                key={trace.key}
                className="border-t"
                data-testid="power-timeline-summary-trace"
                data-trace={trace.key}
              >
                {summary.pools.map((pool, index) => {
                  const validated = validatedWatts(point, pool.role);
                  return (
                    <tr key={pool.role} data-testid={`power-timeline-summary-${pool.role}`}>
                      {index === 0 && (
                        <>
                          <th className="p-2 align-top font-normal" rowSpan={summary.pools.length}>
                            <span style={{ color: colorOf(trace) }}>● </span>
                            {hardwareLabel(point)}
                            <span className="block text-muted-foreground">
                              {traceConfigLabel(point)}
                              {isOverlay(point) ? ` · ${t.unofficial}` : ''}
                            </span>
                          </th>
                          <td className="p-2 align-top" rowSpan={summary.pools.length}>
                            <a
                              href={point.run_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline decoration-dotted"
                            >
                              {`run ${trace.runId}`}
                            </a>
                            {attempt === null ? '' : ` · ${t.attempt(attempt)}`}
                            <span className="block break-all text-muted-foreground">
                              {name ? `power_validation_${name}.json` : '—'}
                              {source ? ` · ${t.source[source]}` : ''}
                            </span>
                          </td>
                          <td className="p-2 align-top" rowSpan={summary.pools.length}>
                            {summary.windowSeconds === null
                              ? t.noWindow
                              : seconds(summary.windowSeconds)}
                          </td>
                        </>
                      )}
                      <td className="p-2 align-top">
                        {t.pools[pool.role]} · {pool.gpuCount}
                      </td>
                      <td className="p-2 align-top">
                        {validated === null ? '—' : watts(validated)}
                      </td>
                      <td className="p-2 align-top">
                        {pool.peakWatts === null ? '—' : watts(pool.peakWatts)}
                      </td>
                      <td className="p-2 align-top">
                        {tdp > 0 ? watts(tdp * pool.gpuCount) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {t.method(buckets.length === 1 ? buckets[0] : null)}
      </p>
    </section>
  );
}
