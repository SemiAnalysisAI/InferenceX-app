'use client';

import * as d3 from 'd3';
import { type ReactNode, useMemo, useState, useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { isDarkTheme } from '@/lib/themes/themes';
import { generateVendorColors } from '@/lib/charts/dynamic-colors';

import ChartLegend from '@/components/ui/chart-legend';
import { ChartSection } from '@/components/ui/chart-section';
import { Heading } from '@/components/ui/heading';
import { LabelWithTooltip } from '@/components/ui/label-with-tooltip';
import { ResultContext } from '@/components/ui/result-context';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { track } from '@/lib/analytics/analytics';
import { D3Chart } from '@/lib/d3-chart/D3Chart';
import { chartHoverCard } from '@/lib/d3-chart/tooltip-shell';
import { useLocale } from '@/lib/i18n/use-locale';
import type { Locale } from '@/lib/i18n/i18n';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';

import { UbenchxHub } from './UbenchxHub';
import { UBENCHX_GPU_KEYS, UBENCHX_RUNS } from './ubenchx-data';
import {
  transformUbenchxRun,
  formatBytes,
  sizeAxisTicks,
  type UbenchxDerivedRow,
} from './ubenchx-transform';

const subscribeNoop = () => () => {};

function ubenchxHwKey(key: string): string {
  return key.startsWith('Huawei') ? key : key.split(' ')[0].toLowerCase();
}

function ubenchxColors(theme: 'light' | 'dark'): Record<string, string> {
  const colors = generateVendorColors(UBENCHX_GPU_KEYS.map(ubenchxHwKey), theme);
  return Object.fromEntries(UBENCHX_GPU_KEYS.map((key) => [key, colors[ubenchxHwKey(key)]]));
}

const STRINGS = {
  en: {
    protocolNote:
      'Huawei uses amortized rotating-buffer graph timing; NVIDIA/AMD use Triton copy timing. Small-message latency is not directly comparable.',
    latencyTitle: 'Latency vs message size',
    latencyY: 'Latency (ms)',
    mbuTitle: 'Memory bandwidth utilization (MBU) vs message size',
    mbuY: 'MBU (%)',
    bwTitle: 'Bandwidth vs message size',
    bwY: 'Bandwidth (TB/s)',
    xAxis: 'Message size',
    yMetric: 'Y-axis',
    yMetricTooltip:
      'The measurement plotted on the Y-axis, either memory bandwidth utilization, copy bandwidth or latency.',
    peakNote: 'MBU uses each device’s peak bandwidth',
    methodology: 'Methodology',
    methodologyText:
      'NVIDIA/AMD: times b.copy_(a) on float32 tensors using triton.testing.do_bench; bandwidth = 2 * bytes / time (read + write). Power-of-two sizes from 8 B to 16 GiB.',
    huaweiMethodology:
      'Huawei: FP16 rotating source/destination pools of at least 512 MiB each, timed as full rotating-buffer NPU graph replays. Three processes, 360 observations per size; full copied-bit checks before/after each block. Graph time is amortized per copy, not isolated-copy latency. Protocols differ from the GPU curves. No physical HBM-traffic counters were collected. The 8 B–2 KiB points were added on 30 October with CANN 9.2.1 and 4 KiB slot spacing; touched payload may fit in cache. Points from 4 KiB upward retain the original CANN 9.1.0 run.',
    huaweiReference:
      'Huawei MBU uses the 1,638.4 GB/s peak (8 HBM stacks × 256 bits × 6.4 Gbps), which Huawei rounds to 1.6 TB/s.',
    amortized: 'Amortized graph copy time',
    sources: 'Sources: ',
    device: 'Device',
    hardware: 'Hardware',
    driver: 'Driver',
    runtime: 'Runtime',
    container: 'Container',
    peak: 'Peak bandwidth',
    instructions: 'Shift+Scroll to zoom · Drag to pan · Double-click to reset',
    tooltipSize: 'Size',
    tooltipLatency: 'Latency',
    tooltipBandwidth: 'Bandwidth',
    tooltipMbu: 'MBU',
    tooltipPeak: 'Bandwidth reference',
    withUnit: (label: string, unit: string) => `${label} (${unit})`,
    aria: 'ubenchX device-memory copy bandwidth charts',
  },
  zh: {
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
    yMetricTooltip: '图表 Y 轴显示的测量值，可选显存带宽利用率、拷贝带宽或延迟。',
    peakNote: 'MBU 按各设备的峰值带宽计算',
    methodology: '测试方法',
    methodologyText:
      'NVIDIA/AMD：使用 triton.testing.do_bench 计时 b.copy_(a)（float32 张量）；带宽 = 2 * bytes / time（读 + 写）。消息大小为 2 的幂次，从 8 B 到 16 GiB。',
    huaweiMethodology:
      'Huawei：源和目标分别使用至少 512 MiB 的 FP16 轮转缓冲池，每次计时覆盖完整缓冲池轮转的一次 NPU 图重放。每个大小在三个进程中共测量 360 次，每个测量块前后逐位校验全部拷贝结果。图执行时间按拷贝次数摊销，不代表单次独立拷贝延迟；与 GPU 曲线的测试协议不同，且未采集物理 HBM 流量计数器。8 B–2 KiB 的数据点于 10 月 30 日使用 CANN 9.2.1 补测，缓冲槽间距为 4 KiB，实际访问的数据可能驻留在缓存中。4 KiB 及以上的数据点仍沿用原 CANN 9.1.0 的测量结果。',
    huaweiReference:
      'Huawei 的 MBU 按峰值带宽 1,638.4 GB/s 计算（8 个 HBM stack × 256 位 × 6.4 Gbps），Huawei 将其取整为 1.6 TB/s。',
    amortized: '摊销后的图拷贝时间',
    sources: '数据来源：',
    device: '设备',
    hardware: '硬件',
    driver: '驱动',
    runtime: '运行时',
    container: '容器',
    peak: '峰值带宽',
    instructions: 'Shift+滚轮缩放 · 拖动平移 · 双击重置',
    tooltipSize: '大小',
    tooltipLatency: '延迟',
    tooltipBandwidth: '带宽',
    tooltipMbu: 'MBU',
    tooltipPeak: '带宽参考值',
    withUnit: (label: string, unit: string) => `${label}（${unit}）`,
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

function formatTooltip(
  point: ChartPoint,
  isPinned: boolean,
  t: (typeof STRINGS)[Locale],
  colors: Record<string, string>,
): string {
  return chartHoverCard(
    {
      title: point.gpuKey,
      subtitle: point.sizeLabel,
      color: colors[point.gpuKey] ?? '#888',
      metrics: [
        {
          value: point.timeMs.toFixed(4),
          label: t.withUnit(
            UBENCHX_RUNS[point.gpuKey].metadata.protocol ? t.amortized : t.tooltipLatency,
            'ms',
          ),
        },
        {
          value: (point.bandwidthGbps / 1000).toFixed(3),
          label: t.withUnit(t.tooltipBandwidth, 'TB/s'),
        },
        { value: `${point.mbuPercent.toFixed(1)}%`, label: t.tooltipMbu },
      ],
      summary: `${t.tooltipPeak} ${Number((point.peakBandwidthGbps / 1000).toPrecision(3))} TB/s`,
    },
    { pinned: isPinned },
  );
}

function UbenchxChart({
  chartId,
  allPoints,
  gpuKeys,
  yLabel,
  yScaleType,
  locale,
  percent,
  colors,
  theme,
  caption,
  footer,
}: {
  chartId: string;
  allPoints: ChartPoint[];
  gpuKeys: readonly string[];
  yLabel: string;
  yScaleType: 'log' | 'linear';
  locale: Locale;
  percent: boolean;
  colors: Record<string, string>;
  theme: 'light' | 'dark';
  caption: ReactNode;
  footer: ReactNode;
}) {
  const t = STRINGS[locale];
  const [legendExpanded, setLegendExpanded] = useState(true);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const visiblePoints = useMemo(
    () => allPoints.filter((p) => !hidden.has(p.gpuKey)),
    [allPoints, hidden],
  );

  const lines = useMemo(() => {
    const result: Record<string, { x: number; y: number }[]> = {};
    for (const key of gpuKeys) {
      const pts = visiblePoints
        .filter((p) => p.gpuKey === key)
        .sort((a, b) => a.x - b.x)
        .map((p) => ({ x: p.x, y: p.y }));
      if (pts.length > 0) result[key] = pts;
    }
    return result;
  }, [visiblePoints, gpuKeys]);

  const xDomain = useMemo<[number, number]>(() => {
    const xs = allPoints.map((p) => p.x);
    return [d3.min(xs) ?? 1, d3.max(xs) ?? 1];
  }, [allPoints]);

  const yDomain = useMemo<[number, number]>(() => {
    const ys = allPoints.map((p) => p.y);
    return percent ? [0, Math.max(100, d3.max(ys) ?? 0)] : paddedDomain(ys);
  }, [allPoints, percent]);

  const yTickValues = useMemo(() => {
    if (yScaleType !== 'log') return undefined;
    const [lo, hi] = yDomain;
    const ticks: number[] = [];
    for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++)
      ticks.push(10 ** e);
    return ticks;
  }, [yScaleType, yDomain]);

  const isMobile = useIsMobileViewport();
  const xTickValues = useMemo(
    () => sizeAxisTicks(...xDomain, isMobile ? 4 : 7),
    [xDomain, isMobile],
  );

  return (
    <ChartSection
      chartId={chartId}
      analyticsPrefix="ubenchx"
      zoomResetEvent={`ubenchx_zoom_reset_${chartId}`}
      setIsLegendExpanded={setLegendExpanded}
      exportFileName={`InferenceX_${chartId}`}
    >
      <D3Chart<ChartPoint>
        chartId={chartId}
        caption={caption}
        footer={footer}
        displayIdentity={theme}
        data={visiblePoints}
        height={440}
        margin={{ top: 24, right: 20, bottom: 62, left: 78 }}
        watermark="logo"
        grabCursor
        instructions={t.instructions}
        xScale={{ type: 'log', domain: xDomain, nice: false }}
        yScale={{
          type: yScaleType,
          domain: yDomain,
          nice: yScaleType === 'linear' && !percent,
        }}
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
            if (v >= 1000) return `${Number((v / 1000).toFixed(v >= 10000 ? 0 : 1))}k`;
            if (v >= 1) return String(Number(v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)));
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
            data: visiblePoints,
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
        legendElement={
          <ChartLegend
            variant="sidebar"
            readOnly
            disableActiveSort
            isLegendExpanded={legendExpanded}
            onExpandedChange={setLegendExpanded}
            legendItems={gpuKeys.map((key) => ({
              name: key,
              label: key,
              color: colors[key] ?? '#888',
              isActive: !hidden.has(key),
              onClick: () =>
                setHidden((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(key)) next.add(key);
                  return next;
                }),
            }))}
          />
        }
      />
    </ChartSection>
  );
}

export function UbenchxContent() {
  const { resolvedTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const theme = hydrated && isDarkTheme(resolvedTheme) ? 'dark' : 'light';
  const colors = useMemo(() => ubenchxColors(theme), [theme]);
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

  const hub = (
    <UbenchxHub
      current="mem-bw"
      controls={
        <div className="flex min-w-0 flex-col space-y-1.5">
          <LabelWithTooltip
            htmlFor="ubenchx-metric-select"
            label={t.yMetric}
            tooltip={t.yMetricTooltip}
          />
          <Select
            value={metric.key}
            onValueChange={(value) => {
              setMetricKey(value as ChartType);
              track('ubenchx_metric_changed', { metric: value });
            }}
          >
            <SelectTrigger
              id="ubenchx-metric-select"
              className="w-full"
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
      }
    />
  );

  if (viewResults.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {hub}
        <p className="text-sm text-muted-foreground">No data available</p>
      </div>
    );
  }

  const gpuKeys = viewResults.map((r) => r.gpu);

  const sourceUrls = [...new Set(viewResults.map((r) => r.metadata.sourceUrl))];
  const specHeaders = [t.device, t.hardware, t.driver, 'PyTorch', t.runtime, t.container, t.peak];

  return (
    <div className="flex flex-col gap-4" role="group" aria-label={t.aria}>
      {hub}

      <UbenchxChart
        key={metric.key}
        chartId={`ubenchx-${metric.key}`}
        allPoints={points}
        gpuKeys={gpuKeys}
        yLabel={t[metric.label]}
        yScaleType={metric.scale}
        locale={locale}
        percent={metric.key === 'mbu'}
        colors={colors}
        theme={theme}
        caption={
          <div className="md:pr-24">
            <Heading as="h2" level="card">
              {t[metric.title]}
            </Heading>
            {metric.key === 'mbu' && (
              <p className="mt-1 text-xs text-muted-foreground">{t.peakNote}</p>
            )}
          </div>
        }
        footer={
          <div className="mt-3">
            <ResultContext locale={locale} layout="footer" source="SemiAnalysis InferenceX™" />
            <div className="mt-3 max-w-[80ch] space-y-1.5 text-xs leading-5 text-muted-foreground">
              <p>{t.protocolNote}</p>
              <h3 className="pt-1.5 font-medium text-foreground">{t.methodology}</h3>
              <p>{t.methodologyText}</p>
              <p>{t.huaweiMethodology}</p>
              <p>{t.huaweiReference}</p>
            </div>
            <div className="mt-3 overflow-x-auto" data-testid="ubenchx-device-specs">
              <table className="w-full text-left text-xs text-muted-foreground tabular-nums">
                <thead>
                  <tr className="border-b border-border/60">
                    {specHeaders.map((header, index) => (
                      <th
                        key={header}
                        scope="col"
                        className={
                          index === specHeaders.length - 1
                            ? 'py-1.5 text-right font-medium whitespace-nowrap'
                            : 'py-1.5 pr-4 font-medium whitespace-nowrap'
                        }
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewResults.map((r) => (
                    <tr key={r.gpu} className="border-b border-border/30 last:border-b-0">
                      <th
                        scope="row"
                        className="py-1.5 pr-4 font-medium whitespace-nowrap text-foreground"
                      >
                        {r.gpu}
                      </th>
                      <td className="py-1.5 pr-4 whitespace-nowrap">{r.metadata.gpu}</td>
                      <td className="py-1.5 pr-4 whitespace-nowrap">{r.metadata.driver}</td>
                      <td className="py-1.5 pr-4 whitespace-nowrap">{r.metadata.torch}</td>
                      <td className="py-1.5 pr-4 whitespace-nowrap">
                        {r.metadata.cann
                          ? `CANN ${r.metadata.cann} · torch_npu ${r.metadata.torchNpu}`
                          : `Triton ${r.metadata.triton}`}
                      </td>
                      <td className="min-w-64 py-1.5 pr-4 break-all">
                        {r.metadata.cann ? '—' : r.metadata.container}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {Number((r.peakBandwidthGbps / 1000).toPrecision(3))} TB/s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t.sources}
              {sourceUrls.map((url, index) => {
                const name = url.slice(url.lastIndexOf('/') + 1);
                return (
                  <span key={url}>
                    {index > 0 && ' · '}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      {url.includes('/pull/') ? `PR #${name}` : name}
                    </a>
                  </span>
                );
              })}
            </p>
          </div>
        }
      />
    </div>
  );
}
