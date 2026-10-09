'use client';

import * as d3 from 'd3';
import { useMemo, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/use-locale';
import type { Locale } from '@/lib/i18n';

import { UBENCHX_GPU_KEYS, UBENCHX_RUNS } from './ubenchx-data';
import { transformUbenchxRun, formatBytes, type UbenchxDerivedRow } from './ubenchx-transform';

/**
 * One color per GPU, using the repo's vendor OKLch hue zones:
 * NVIDIA: hue 120-170, chroma ~0.15; AMD: hue 12-42, chroma ~0.18-0.22.
 */
const GPU_COLORS: Record<string, string> = {
  // NVIDIA (green hue zone)
  'B300 SXM': 'oklch(0.62 0.15 128)',
  'GB200 NVL72': 'oklch(0.58 0.15 138)',
  'B200 SXM': 'oklch(0.54 0.15 148)',
  'H200 SXM': 'oklch(0.50 0.15 158)',
  'H100 SXM': 'oklch(0.46 0.15 168)',
  // AMD (red-orange hue zone)
  MI355X: 'oklch(0.62 0.20 18)',
  MI325X: 'oklch(0.55 0.20 28)',
  MI300X: 'oklch(0.48 0.20 38)',
};

const STRINGS = {
  en: {
    pageTitle: 'Device-Memory Copy Bandwidth',
    pageSubtitle:
      'Microbenchmark measuring device-memory copy bandwidth across message sizes on NVIDIA and AMD GPUs.',
    latencyTitle: 'Latency vs Message Size',
    latencyY: 'Latency (ms)',
    mbuTitle: 'Memory Bandwidth Utilization (MBU) vs Message Size',
    mbuY: 'MBU (%)',
    bwTitle: 'Bandwidth vs Message Size',
    bwY: 'Bandwidth (TB/s)',
    xAxis: 'Message Size',
    yMetric: 'Y-axis',
    peakNote: "MBU is relative to each GPU's own peak HBM bandwidth from GPU_SPECS.",
    methodology: 'Methodology',
    methodologyText:
      'Times b.copy_(a) on float32 tensors using triton.testing.do_bench; bandwidth = 2 * bytes / time (read + write). Power-of-two sizes from 8 B to 16 GiB.',
    source: 'Source',
    instructions:
      'Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    dismiss: 'Click elsewhere to dismiss',
    tooltipSize: 'Size',
    tooltipLatency: 'Latency',
    tooltipBandwidth: 'Bandwidth',
    tooltipMbu: 'MBU',
    tooltipPeak: 'Peak BW',
    aria: 'ubenchX device-memory copy bandwidth charts',
  },
  zh: {
    pageTitle: '显存拷贝带宽',
    pageSubtitle: '在 NVIDIA 和 AMD GPU 上测量不同消息大小的显存拷贝带宽微基准测试。',
    latencyTitle: '延迟 vs 消息大小',
    latencyY: '延迟（ms）',
    mbuTitle: '显存带宽利用率（MBU）vs 消息大小',
    mbuY: 'MBU（%）',
    bwTitle: '带宽 vs 消息大小',
    bwY: '带宽（TB/s）',
    xAxis: '消息大小',
    yMetric: 'Y 轴',
    peakNote: 'MBU 基于各 GPU 自身在 GPU_SPECS 中的峰值 HBM 带宽计算。',
    methodology: '测试方法',
    methodologyText:
      '使用 triton.testing.do_bench 计时 b.copy_(a)（float32 张量）；带宽 = 2 * bytes / time（读 + 写）。消息大小为 2 的幂次，从 8 B 到 16 GiB。',
    source: '数据来源',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    dismiss: '点击其他区域关闭',
    tooltipSize: '大小',
    tooltipLatency: '延迟',
    tooltipBandwidth: '带宽',
    tooltipMbu: 'MBU',
    tooltipPeak: '峰值带宽',
    aria: 'ubenchX 显存拷贝带宽图表',
  },
} as const;

type ChartType = 'latency' | 'mbu' | 'bandwidth';

const Y_METRICS: readonly {
  key: ChartType;
  title: 'latencyTitle' | 'mbuTitle' | 'bwTitle';
  label: 'latencyY' | 'mbuY' | 'bwY';
  scale: 'log' | 'linear';
}[] = [
  { key: 'mbu', title: 'mbuTitle', label: 'mbuY', scale: 'linear' },
  { key: 'bandwidth', title: 'bwTitle', label: 'bwY', scale: 'linear' },
  { key: 'latency', title: 'latencyTitle', label: 'latencyY', scale: 'log' },
];

interface ChartPoint extends UbenchxDerivedRow {
  x: number;
  y: number;
  gpuKey: string;
  peakBandwidthGbps: number;
}

function makePoints(
  rows: readonly UbenchxDerivedRow[],
  chart: ChartType,
  gpuKey: string,
  peakBandwidthGbps: number,
): ChartPoint[] {
  return rows.map((row) => ({
    ...row,
    x: row.bytes,
    y:
      chart === 'latency'
        ? row.timeMs
        : chart === 'mbu'
          ? row.mbuPercent
          : row.bandwidthGbps / 1000,
    gpuKey,
    peakBandwidthGbps,
  }));
}

function paddedDomain(values: number[]): [number, number] {
  if (values.length === 0) return [1, 10];
  const min = d3.min(values) ?? 1;
  const max = d3.max(values) ?? 1;
  return min === max ? [min / 2, max * 2] : [min / 1.2, max * 1.2];
}

// Same card and row styling as the /inference scatter tooltips (tooltipUtils.ts).
const tooltipLine = (label: string, value: string) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${label}:</strong> ${value}</div>`;

function formatTooltip(point: ChartPoint, isPinned: boolean, t: (typeof STRINGS)[Locale]): string {
  const color = GPU_COLORS[point.gpuKey] ?? '#888';
  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      <div style="display: flex; align-items: center; gap: 6px; color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background: ${color};"></span>${point.gpuKey}
      </div>
      ${tooltipLine(t.tooltipSize, point.sizeLabel)}
      ${tooltipLine(t.tooltipLatency, `${point.timeMs.toFixed(4)} ms`)}
      ${tooltipLine(t.tooltipBandwidth, `${(point.bandwidthGbps / 1000).toFixed(3)} TB/s`)}
      ${tooltipLine(t.tooltipMbu, `${point.mbuPercent.toFixed(1)}%`)}
      ${tooltipLine(t.tooltipPeak, `${point.peakBandwidthGbps / 1000} TB/s`)}
    </div>
  `;
}

/** Simple inline legend rendered above charts. */
function GpuLegend({ gpuKeys }: { gpuKeys: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {gpuKeys.map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: GPU_COLORS[key] ?? '#888' }}
          />
          {key}
        </span>
      ))}
    </div>
  );
}

function UbenchxChart({
  chartId,
  allPoints,
  gpuKeys,
  yLabel,
  yScaleType,
  locale,
}: {
  chartId: string;
  allPoints: ChartPoint[];
  gpuKeys: readonly string[];
  yLabel: string;
  yScaleType: 'log' | 'linear';
  locale: Locale;
}) {
  const t = STRINGS[locale];

  const lines = useMemo(() => {
    const result: Record<string, { x: number; y: number }[]> = {};
    for (const key of gpuKeys) {
      const pts = allPoints
        .filter((p) => p.gpuKey === key)
        .sort((a, b) => a.x - b.x)
        .map((p) => ({ x: p.x, y: p.y }));
      if (pts.length > 0) result[key] = pts;
    }
    return result;
  }, [allPoints, gpuKeys]);

  const xDomain = useMemo<[number, number]>(() => {
    const xs = allPoints.map((p) => p.x);
    return [d3.min(xs) ?? 1, d3.max(xs) ?? 1];
  }, [allPoints]);

  const yDomain = useMemo<[number, number]>(
    () => paddedDomain(allPoints.map((p) => p.y)),
    [allPoints],
  );

  // Log axes get one tick per decade; d3's default log ticks crowd the axis.
  const yTickValues = useMemo(() => {
    if (yScaleType !== 'log') return undefined;
    const [lo, hi] = yDomain;
    const ticks: number[] = [];
    for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++)
      ticks.push(10 ** e);
    return ticks;
  }, [yScaleType, yDomain]);

  const xTickValues = useMemo(() => {
    const all = [...new Set(allPoints.map((p) => p.x))].sort((a, b) => a - b);
    return all.filter((_, i) => i % 3 === 0 || i === all.length - 1);
  }, [allPoints]);

  return (
    <D3Chart<ChartPoint>
      chartId={chartId}
      data={allPoints}
      height={440}
      margin={{ top: 24, right: 20, bottom: 62, left: 78 }}
      watermark="logo"
      grabCursor
      instructions={t.instructions}
      xScale={{ type: 'log', domain: xDomain, nice: false }}
      yScale={{ type: yScaleType, domain: yDomain, nice: yScaleType === 'linear' }}
      xAxis={{
        label: t.xAxis,
        tickCount: 8,
        tickValues: xTickValues,
        tickFormat: (value) => formatBytes(Number(value)),
      }}
      yAxis={{
        label: yLabel,
        tickCount: 6,
        tickValues: yTickValues,
        tickFormat: (value) => {
          const v = Number(value);
          if (v === 0) return '0';
          if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
          if (v >= 1) return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2);
          return String(Number(v.toPrecision(2)));
        },
      }}
      layers={[
        {
          type: 'line',
          key: `ubenchx-line-${chartId}`,
          lines,
          config: {
            getColor: (key) => GPU_COLORS[key] ?? '#888',
            strokeWidth: 2.25,
            curve: d3.curveMonotoneX,
          },
        },
        {
          type: 'point',
          key: `ubenchx-points-${chartId}`,
          data: allPoints,
          config: {
            getCx: () => 0,
            getCy: () => 0,
            getX: (point) => point.x,
            getY: (point) => point.y,
            getColor: (point) => GPU_COLORS[point.gpuKey] ?? '#888',
            getRadius: () => 3.5,
            stroke: 'var(--background)',
            strokeWidth: 1,
            keyFn: (point) => `${point.gpuKey}-${point.bytes}`,
            maxPoints: Infinity,
          },
        },
      ]}
      zoom={{
        enabled: true,
        resetEventName: `ubenchx_zoom_reset_${chartId}`,
      }}
      tooltip={{
        rulerType: 'crosshair',
        attachToLayer: 1,
        content: (point, isPinned) => formatTooltip(point, isPinned, STRINGS[locale]),
      }}
    />
  );
}

export function UbenchxContent() {
  const locale = useLocale();
  const t = STRINGS[locale];

  const viewResults = useMemo(
    () =>
      UBENCHX_GPU_KEYS.filter((key) => key in UBENCHX_RUNS).map((key) =>
        transformUbenchxRun(key, UBENCHX_RUNS[key]),
      ),
    [],
  );

  const [metricKey, setMetricKey] = useState<ChartType>('mbu');
  const metric = Y_METRICS.find((m) => m.key === metricKey) ?? Y_METRICS[0];

  const points = useMemo(
    () => viewResults.flatMap((r) => makePoints(r.rows, metric.key, r.gpu, r.peakBandwidthGbps)),
    [viewResults, metric.key],
  );

  if (viewResults.length === 0) {
    return <p className="text-sm text-muted-foreground">No data available.</p>;
  }

  const gpuKeys = viewResults.map((r) => r.gpu);

  // Deduplicate source URLs for the footer.
  const sourceUrls = [...new Set(viewResults.map((r) => r.metadata.sourceUrl))];

  return (
    <div className="space-y-8" role="group" aria-label={t.aria}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t.pageTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t.pageSubtitle}</p>
      </div>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <label
          htmlFor="ubenchx-metric-select"
          className="text-sm font-medium text-muted-foreground"
        >
          {t.yMetric}
        </label>
        <Select
          value={metric.key}
          onValueChange={(value) => {
            setMetricKey(value as ChartType);
            track('ubenchx_metric_changed', { metric: value });
          }}
        >
          <SelectTrigger
            id="ubenchx-metric-select"
            className="w-full sm:w-[240px]"
            data-testid="ubenchx-metric-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Y_METRICS.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                {t[m.label]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <GpuLegend gpuKeys={gpuKeys} />

      <section>
        <h2 className="text-lg font-semibold mb-2">{t[metric.title]}</h2>
        {metric.key === 'mbu' && <p className="text-xs text-muted-foreground mb-1">{t.peakNote}</p>}
        <UbenchxChart
          key={metric.key}
          chartId={`ubenchx-${metric.key}`}
          allPoints={points}
          gpuKeys={gpuKeys}
          yLabel={t[metric.label]}
          yScaleType={metric.scale}
          locale={locale}
        />
      </section>

      {/* Methodology and metadata */}
      <section className="text-xs text-muted-foreground space-y-1">
        <h3 className="text-sm font-semibold">{t.methodology}</h3>
        <p>{t.methodologyText}</p>
        {viewResults.map((r) => (
          <p key={r.gpu}>
            <strong>{r.gpu}:</strong> {r.metadata.gpu} | Driver: {r.metadata.driver} | PyTorch:{' '}
            {r.metadata.torch} | Triton: {r.metadata.triton} | Container: {r.metadata.container} |
            Peak: {r.peakBandwidthGbps / 1000} TB/s (GPU_SPECS)
          </p>
        ))}
        {sourceUrls.map((url) => (
          <p key={url}>
            {t.source}:{' '}
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
              {url}
            </a>
          </p>
        ))}
      </section>
    </div>
  );
}
