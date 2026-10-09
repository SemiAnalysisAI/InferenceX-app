'use client';

import * as d3 from 'd3';
import { useMemo } from 'react';

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
    pageTitle: 'ubenchX: Device-Memory Copy Bandwidth',
    pageSubtitle:
      'Microbenchmark measuring device-memory copy bandwidth across message sizes on NVIDIA GPUs.',
    latencyTitle: 'Latency vs Message Size',
    latencyY: 'Latency (ms)',
    mbuTitle: 'Memory Bandwidth Utilization (MBU) vs Message Size',
    mbuY: 'MBU (%)',
    bwTitle: 'Bandwidth vs Message Size',
    bwY: 'Bandwidth (GB/s)',
    xAxis: 'Message Size',
    peakNote: "MBU is relative to each GPU's own peak HBM bandwidth from GPU_SPECS.",
    methodology: 'Methodology',
    methodologyText:
      'Times b.copy_(a) on float32 tensors using triton.testing.do_bench; bandwidth = 2 * bytes / time (read + write). Power-of-two sizes from 8 B to 16 GiB.',
    source: 'Source',
    instructions:
      'Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    tooltipGpu: 'GPU',
    tooltipSize: 'Size',
    tooltipLatency: 'Latency',
    tooltipBandwidth: 'Bandwidth',
    tooltipMbu: 'MBU',
    tooltipPeak: 'Peak BW',
    aria: 'ubenchX device-memory copy bandwidth charts',
  },
  zh: {
    pageTitle: 'ubenchX：显存拷贝带宽',
    pageSubtitle: '在 NVIDIA GPU 上测量不同消息大小的显存拷贝带宽微基准测试。',
    latencyTitle: '延迟 vs 消息大小',
    latencyY: '延迟（ms）',
    mbuTitle: '显存带宽利用率（MBU）vs 消息大小',
    mbuY: 'MBU（%）',
    bwTitle: '带宽 vs 消息大小',
    bwY: '带宽（GB/s）',
    xAxis: '消息大小',
    peakNote: 'MBU 基于各 GPU 自身在 GPU_SPECS 中的峰值 HBM 带宽计算。',
    methodology: '测试方法',
    methodologyText:
      '使用 triton.testing.do_bench 计时 b.copy_(a)（float32 张量）；带宽 = 2 * bytes / time（读 + 写）。消息大小为 2 的幂次，从 8 B 到 16 GiB。',
    source: '数据来源',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    tooltipGpu: 'GPU',
    tooltipSize: '大小',
    tooltipLatency: '延迟',
    tooltipBandwidth: '带宽',
    tooltipMbu: 'MBU',
    tooltipPeak: '峰值带宽',
    aria: 'ubenchX 显存拷贝带宽图表',
  },
} as const;

type ChartType = 'latency' | 'mbu' | 'bandwidth';

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
    y: chart === 'latency' ? row.timeMs : chart === 'mbu' ? row.mbuPercent : row.bandwidthGbps,
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

function formatTooltip(point: ChartPoint, t: (typeof STRINGS)[Locale]): string {
  const lines = [
    `<strong>${t.tooltipGpu}:</strong> ${point.gpuKey}`,
    `<strong>${t.tooltipSize}:</strong> ${point.sizeLabel}`,
    `<strong>${t.tooltipLatency}:</strong> ${point.timeMs < 0.01 ? point.timeMs.toFixed(4) : point.timeMs.toFixed(4)} ms`,
    `<strong>${t.tooltipBandwidth}:</strong> ${point.bandwidthGbps.toFixed(2)} GB/s`,
    `<strong>${t.tooltipMbu}:</strong> ${point.mbuPercent.toFixed(2)}%`,
    `<strong>${t.tooltipPeak}:</strong> ${point.peakBandwidthGbps.toFixed(0)} GB/s`,
  ];
  return lines.join('<br>');
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
        tickFormat: (value) => {
          const v = Number(value);
          if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
          if (v >= 1) return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2);
          return v.toFixed(4);
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
        content: (point) => formatTooltip(point, STRINGS[locale]),
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

  if (viewResults.length === 0) {
    return <p className="text-sm text-muted-foreground">No data available.</p>;
  }

  const gpuKeys = viewResults.map((r) => r.gpu);

  const latencyPoints = useMemo(
    () => viewResults.flatMap((r) => makePoints(r.rows, 'latency', r.gpu, r.peakBandwidthGbps)),
    [viewResults],
  );
  const mbuPoints = useMemo(
    () => viewResults.flatMap((r) => makePoints(r.rows, 'mbu', r.gpu, r.peakBandwidthGbps)),
    [viewResults],
  );
  const bwPoints = useMemo(
    () => viewResults.flatMap((r) => makePoints(r.rows, 'bandwidth', r.gpu, r.peakBandwidthGbps)),
    [viewResults],
  );

  // Deduplicate source URLs for the footer.
  const sourceUrls = [...new Set(viewResults.map((r) => r.metadata.sourceUrl))];

  return (
    <div className="space-y-8" role="group" aria-label={t.aria}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t.pageTitle}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.pageSubtitle}</p>
      </div>

      <GpuLegend gpuKeys={gpuKeys} />

      {/* Chart 1: Latency */}
      <section>
        <h2 className="text-lg font-semibold mb-2">{t.latencyTitle}</h2>
        <UbenchxChart
          chartId="ubenchx-latency"
          allPoints={latencyPoints}
          gpuKeys={gpuKeys}
          yLabel={t.latencyY}
          yScaleType="log"
          locale={locale}
        />
      </section>

      {/* Chart 2: MBU */}
      <section>
        <h2 className="text-lg font-semibold mb-2">{t.mbuTitle}</h2>
        <p className="text-xs text-muted-foreground mb-1">{t.peakNote}</p>
        <UbenchxChart
          chartId="ubenchx-mbu"
          allPoints={mbuPoints}
          gpuKeys={gpuKeys}
          yLabel={t.mbuY}
          yScaleType="linear"
          locale={locale}
        />
      </section>

      {/* Chart 3: Bandwidth */}
      <section>
        <h2 className="text-lg font-semibold mb-2">{t.bwTitle}</h2>
        <UbenchxChart
          chartId="ubenchx-bandwidth"
          allPoints={bwPoints}
          gpuKeys={gpuKeys}
          yLabel={t.bwY}
          yScaleType="linear"
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
            Peak: {r.peakBandwidthGbps} GB/s ({r.peakBandwidthSource})
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
