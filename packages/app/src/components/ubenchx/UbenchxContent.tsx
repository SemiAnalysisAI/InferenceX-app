'use client';

import * as d3 from 'd3';
import { useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/themes/themes';
import { generateVendorColors, getVendor } from '@/lib/charts/dynamic-colors';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics/analytics';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { useLocale } from '@/lib/i18n/use-locale';
import type { Locale } from '@/lib/i18n/i18n';

import { UBENCHX_GPU_KEYS, UBENCHX_RUNS } from './ubenchx-data';
import {
  transformUbenchxRun,
  formatBytes,
  sizeAxisTicks,
  type UbenchxDerivedRow,
} from './ubenchx-transform';

const GPU_COLORS: Record<string, string> = {
  'B300 SXM': 'oklch(0.62 0.15 128)',
  'GB200 NVL72': 'oklch(0.58 0.15 138)',
  'B200 SXM': 'oklch(0.54 0.15 148)',
  'H200 SXM': 'oklch(0.50 0.15 158)',
  'H100 SXM': 'oklch(0.46 0.15 168)',
  MI355X: 'oklch(0.62 0.20 18)',
  MI325X: 'oklch(0.55 0.20 28)',
  MI300X: 'oklch(0.48 0.20 38)',
};

const STRINGS = {
  en: {
    pageTitle: 'HBM Bandwidth',
    pageSubtitle:
      'Microbenchmark measuring device-memory copy bandwidth across message sizes on NVIDIA, AMD and Huawei accelerators.',
    protocolNote:
      'Huawei uses amortized rotating-buffer graph timing; NVIDIA/AMD use Triton copy timing. Small-message latency is not directly comparable.',
    latencyTitle: 'Latency vs Message Size',
    latencyY: 'Latency (ms)',
    mbuTitle: 'Memory Bandwidth Utilization (MBU) vs Message Size',
    mbuY: 'MBU (%)',
    bwTitle: 'Bandwidth vs Message Size',
    bwY: 'Bandwidth (TB/s)',
    xAxis: 'Message Size',
    yMetric: 'Y-axis',
    peakNote:
      'MBU uses each device’s bandwidth reference. Huawei’s 1.6384 TB/s reference is qualified below.',
    methodology: 'Methodology',
    methodologyText:
      'NVIDIA/AMD: times b.copy_(a) on float32 tensors using triton.testing.do_bench; bandwidth = 2 * bytes / time (read + write). Power-of-two sizes from 8 B to 16 GiB.',
    huaweiMethodology:
      'Huawei: FP16 rotating source/destination pools of at least 512 MiB each, timed as full rotating-buffer NPU graph replays. Three processes, 360 observations per size; full copied-bit checks before/after each block. Graph time is amortized per copy, not isolated-copy latency. Protocols differ from the GPU curves. No physical HBM-traffic counters were collected. The 8 B–2 KiB points were added on 30 October with CANN 9.2.1 and 4 KiB slot spacing; touched payload may fit in cache. Points from 4 KiB upward retain the original CANN 9.1.0 run.',
    huaweiReference:
      'Huawei MBU uses a 1,638.4 GB/s reference, derived from the card’s 3200 MHz HBM clock (npu-smi) and the 4096-bit bus implied by Huawei’s rounded 1.6 TB/s figure; the exact board bandwidth ceiling was not independently measured.',
    amortized: 'Amortized graph copy time',
    source: 'Source',
    instructions:
      'Shift+Scroll to zoom · Drag to pan · Double-click to reset · Click a point to pin tooltip',
    dismiss: 'Click elsewhere to dismiss',
    tooltipSize: 'Size',
    tooltipLatency: 'Latency',
    tooltipBandwidth: 'Bandwidth',
    tooltipMbu: 'MBU',
    tooltipPeak: 'Bandwidth reference',
    aria: 'ubenchX device-memory copy bandwidth charts',
  },
  zh: {
    pageTitle: 'HBM 带宽',
    pageSubtitle: '测量 NVIDIA、AMD 和 Huawei 加速器在不同消息大小下的显存拷贝带宽。',
    protocolNote:
      'Huawei 使用轮转缓冲区的图执行摊销计时；NVIDIA/AMD 使用 Triton 拷贝计时。小消息延迟不能直接比较。',
    latencyTitle: '延迟 vs 消息大小',
    latencyY: '延迟（ms）',
    mbuTitle: '显存带宽利用率（MBU）vs 消息大小',
    mbuY: 'MBU（%）',
    bwTitle: '带宽 vs 消息大小',
    bwY: '带宽（TB/s）',
    xAxis: '消息大小',
    yMetric: 'Y 轴',
    peakNote: 'MBU 按各设备的带宽参考值计算。Huawei 的 1.6384 TB/s 参考值及其限制见下文。',
    methodology: '测试方法',
    methodologyText:
      'NVIDIA/AMD：使用 triton.testing.do_bench 计时 b.copy_(a)（float32 张量）；带宽 = 2 * bytes / time（读 + 写）。消息大小为 2 的幂次，从 8 B 到 16 GiB。',
    huaweiMethodology:
      'Huawei：源和目标分别使用至少 512 MiB 的 FP16 轮转缓冲池，每次计时覆盖完整缓冲池轮转的一次 NPU 图重放。每个大小在三个进程中共测量 360 次，每个测量块前后逐位校验全部拷贝结果。图执行时间按拷贝次数摊销，不代表单次独立拷贝延迟；与 GPU 曲线的测试协议不同，且未采集物理 HBM 流量计数器。8 B–2 KiB 的数据点于 10 月 30 日使用 CANN 9.2.1 补测，缓冲槽间距为 4 KiB，实际访问的数据可能驻留在缓存中。4 KiB 及以上的数据点仍沿用原 CANN 9.1.0 的测量结果。',
    huaweiReference:
      'Huawei 的 MBU 使用 1,638.4 GB/s 参考值。该值依据 npu-smi 报告的 3200 MHz HBM 时钟推算：要与 Huawei 公布的 1.6 TB/s（取整值）相符，总线位宽应为 4096 位。该板卡的确切带宽上限未经独立实测。',
    amortized: '摊销后的图拷贝时间',
    source: '数据来源',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置 · 点击数据点固定提示框',
    dismiss: '点击其他区域关闭',
    tooltipSize: '大小',
    tooltipLatency: '延迟',
    tooltipBandwidth: '带宽',
    tooltipMbu: 'MBU',
    tooltipPeak: '带宽参考值',
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

const tooltipLine = (label: string, value: string) =>
  `<div style="color: var(--muted-foreground); font-size: 11px; margin-bottom: 4px;"><strong>${label}:</strong> ${value}</div>`;

function formatTooltip(
  point: ChartPoint,
  isPinned: boolean,
  t: (typeof STRINGS)[Locale],
  colors: Record<string, string>,
): string {
  const color = colors[point.gpuKey] ?? '#888';
  return `
    <div style="background: var(--popover); border: 1px solid var(--border); border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); user-select: ${isPinned ? 'text' : 'none'};">
      ${isPinned ? `<div style="color: var(--muted-foreground); font-size: 10px; margin-bottom: 6px; font-style: italic;">${t.dismiss}</div>` : ''}
      <div style="display: flex; align-items: center; gap: 6px; color: var(--foreground); font-size: 12px; font-weight: 600; margin-bottom: 8px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background: ${color};"></span>${point.gpuKey}
      </div>
      ${tooltipLine(t.tooltipSize, point.sizeLabel)}
      ${tooltipLine(UBENCHX_RUNS[point.gpuKey].metadata.protocol ? t.amortized : t.tooltipLatency, `${point.timeMs.toFixed(4)} ms`)}
      ${tooltipLine(t.tooltipBandwidth, `${(point.bandwidthGbps / 1000).toFixed(3)} TB/s`)}
      ${tooltipLine(t.tooltipMbu, `${point.mbuPercent.toFixed(1)}%`)}
      ${tooltipLine(t.tooltipPeak, `${point.peakBandwidthGbps / 1000} TB/s`)}
    </div>
  `;
}

function GpuLegend({
  gpuKeys,
  colors,
}: {
  gpuKeys: readonly string[];
  colors: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {gpuKeys.map((key) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: colors[key] ?? '#888' }}
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
  colors,
  theme,
}: {
  chartId: string;
  allPoints: ChartPoint[];
  gpuKeys: readonly string[];
  yLabel: string;
  yScaleType: 'log' | 'linear';
  locale: Locale;
  colors: Record<string, string>;
  theme: 'light' | 'dark';
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

  const yTickValues = useMemo(() => {
    if (yScaleType !== 'log') return undefined;
    const [lo, hi] = yDomain;
    const ticks: number[] = [];
    for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++)
      ticks.push(10 ** e);
    return ticks;
  }, [yScaleType, yDomain]);

  const xTickValues = useMemo(() => sizeAxisTicks(...xDomain), [xDomain]);

  return (
    <D3Chart<ChartPoint>
      chartId={chartId}
      displayIdentity={theme}
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
            getColor: (key) => colors[key] ?? '#888',
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
            getColor: (point) => colors[point.gpuKey] ?? '#888',
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
        getRulerX: (point, scale) => (scale as d3.ScaleLogarithmic<number, number>)(point.x),
        getRulerY: (point, scale) => scale(point.y),
        attachToLayer: 1,
        content: (point, isPinned) => formatTooltip(point, isPinned, STRINGS[locale], colors),
      }}
    />
  );
}

export function UbenchxContent() {
  const theme = isDarkTheme(useTheme().resolvedTheme) ? 'dark' : 'light';
  const colors = useMemo(
    () => ({
      ...GPU_COLORS,
      ...generateVendorColors(
        UBENCHX_GPU_KEYS.filter((key) => getVendor(key) === 'huawei'),
        theme,
      ),
    }),
    [theme],
  );
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

  const sourceUrls = [...new Set(viewResults.map((r) => r.metadata.sourceUrl))];

  return (
    <div className="space-y-8" role="group" aria-label={t.aria}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t.pageTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t.pageSubtitle}</p>
        <p className="text-sm text-muted-foreground mt-2">{t.protocolNote}</p>
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

      <GpuLegend gpuKeys={gpuKeys} colors={colors} />

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
          colors={colors}
          theme={theme}
        />
      </section>

      <section className="text-xs text-muted-foreground space-y-1">
        <h3 className="text-sm font-semibold">{t.methodology}</h3>
        <p>{t.methodologyText}</p>
        <p>{t.huaweiMethodology}</p>
        <p>{t.huaweiReference}</p>
        {viewResults.map((r) => (
          <p key={r.gpu}>
            <strong>{r.gpu}:</strong> {r.metadata.gpu} | Driver: {r.metadata.driver} | PyTorch:{' '}
            {r.metadata.torch} |{' '}
            {r.metadata.cann
              ? `CANN: ${r.metadata.cann} | torch_npu: ${r.metadata.torchNpu}`
              : `Triton: ${r.metadata.triton} | Container: ${r.metadata.container}`}{' '}
            |{r.peakBandwidthGbps / 1000} TB/s
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
