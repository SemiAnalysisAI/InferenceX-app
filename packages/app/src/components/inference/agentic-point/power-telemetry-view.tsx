'use client';

import { useMemo, useState } from 'react';

import GpuMetricsChart, {
  GPU_COLORS,
  type TelemetryOverlaySeries,
} from '@/components/gpu-power/GpuPowerChart';
import GpuStatsTable from '@/components/gpu-power/GpuStatsTable';
import { TelemetryDisplayControls } from '@/components/gpu-power/TelemetryDisplayControls';
import {
  DEFAULT_TELEMETRY_DISPLAY,
  toAbsoluteMs,
  type TelemetryDisplayState,
} from '@/components/gpu-power/telemetry-smoothing';
import {
  type GpuMetricKey,
  type GpuMetricRow,
  ALL_METRIC_OPTIONS,
  getAvailableMetrics,
  getGpuMetricLabel,
} from '@/components/gpu-power/types';
import { Card } from '@/components/ui/card';
import ChartLegend from '@/components/ui/chart-legend';
import { Label } from '@/components/ui/label';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useGpuMetricsPoint, type GpuMetricSeries } from '@/hooks/api/use-gpu-metrics-point';
import { useTraceServerMetrics } from '@/hooks/api/use-trace-server-metrics';

import { availableOverlaySources, overlaySourceLabel } from './overlay-sources';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    loading: 'Loading PowerX telemetry…',
    error: 'Failed to load PowerX telemetry.',
    missing:
      'No PowerX telemetry is stored for benchmark point #{id}. The run predates telemetry ingestion and its gpu_metrics artifact has expired on GitHub, or the job uploaded no telemetry.',
    series: 'Telemetry series',
    metric: 'Metric',
    vendor: 'Collector',
    samples: 'Samples',
    chips: 'Chips',
    interval: 'Sample interval',
    window: 'Recorded window',
    sharedNote:
      'This series covers the whole benchmark job, including server start-up and warm-up, so summary rows below span more than the measured serving window.',
    perGpuStats: 'Per-chip statistics',
    chip: 'Chip',
    secondsUnit: 's',
    resetFilter: 'Show all chips',
    overlayToggle: 'Overlay server metric',
    overlayNone: 'None',
    overlayLoading: 'Loading server metrics…',
    overlayError: 'Server metrics failed to load; overlays are unavailable.',
    overlayUnavailable: 'This point has no server-metric series to overlay.',
    overlayAligned: 'The overlay is aligned to the telemetry by wall-clock timestamps.',
    overlayRelative:
      'The trace has no wall-clock timestamps, so the overlay and the telemetry are both aligned at their own t=0.',
  },
  zh: {
    loading: '正在加载 PowerX 遥测数据……',
    error: 'PowerX 遥测数据加载失败。',
    missing:
      '基准测试数据点 #{id} 没有存储的 PowerX 遥测数据。该运行早于遥测入库上线且 GitHub 上的 gpu_metrics 产物已过期，或该任务未上传遥测数据。',
    series: '遥测序列',
    metric: '指标',
    vendor: '采集器',
    samples: '样本数',
    chips: '芯片数',
    interval: '采样间隔',
    window: '记录时间窗口',
    sharedNote:
      '该序列覆盖整个基准测试任务，包括服务启动与 warmup 阶段，因此下方统计范围大于实际测量的服务窗口。',
    perGpuStats: '单芯片统计信息',
    chip: '芯片',
    secondsUnit: '秒',
    resetFilter: '显示全部芯片',
    overlayToggle: '叠加服务端指标',
    overlayNone: '无',
    overlayLoading: '正在加载服务端指标……',
    overlayError: '服务端指标加载失败，无法叠加显示。',
    overlayUnavailable: '该数据点没有可叠加的服务端指标序列。',
    overlayAligned: '叠加曲线已按绝对时间戳与遥测数据对齐。',
    overlayRelative: 'trace 缺少绝对时间戳，因此叠加曲线与遥测数据均从各自的 t=0 开始对齐。',
  },
} as const;

const VENDOR_LABEL: Record<string, string> = { nvidia: 'nvidia-smi', amd: 'amd-smi' };

/**
 * Single-node CSVs come from the vendor CLI; multinode power bundles record
 * their own producer (e.g. `srt-slurm.dcgm-power`) in the context sidecar.
 */
export function collectorLabel(series: Pick<GpuMetricSeries, 'vendor' | 'sidecars'>): string {
  const context = series.sidecars?.context;
  const producer =
    context && typeof context === 'object' ? (context as { producer?: unknown }).producer : null;
  if (typeof producer === 'string' && producer.trim() !== '') return producer;
  return VENDOR_LABEL[series.vendor] ?? series.vendor;
}

interface Props {
  id: number;
  enabled: boolean;
  /** The point's hardware key, for the TDP reference line. */
  hardware?: string;
}

function seriesLabel(series: GpuMetricSeries, total: number): string {
  return total > 1 ? `${series.artifactName} · ${series.fileName}` : series.artifactName;
}

/**
 * PowerX tab of the per-point detail page: the full-resolution chip telemetry
 * recorded while this benchmark point ran, read from the ingest-time digest
 * (migration 016) rather than from GitHub artifacts.
 */
export function PowerTelemetryView({ id, enabled, hardware }: Props) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const query = useGpuMetricsPoint(id, enabled);
  const seriesList = query.data?.series ?? [];

  const [seriesSelection, setSeriesSelection] = useState<{ id: number; seriesId: number } | null>(
    null,
  );
  const selectedSeries =
    (seriesSelection?.id === id
      ? seriesList.find((series) => series.id === seriesSelection.seriesId)
      : undefined) ?? seriesList[0];
  const data: GpuMetricRow[] = useMemo(() => selectedSeries?.data ?? [], [selectedSeries]);
  const availableMetrics = useMemo(() => getAvailableMetrics(data), [data]);

  const [metricSelection, setMetricSelection] = useState<GpuMetricKey>('power');
  const metricKey: GpuMetricKey = availableMetrics.some((m) => m.key === metricSelection)
    ? metricSelection
    : 'power';
  const metricConfig = ALL_METRIC_OPTIONS.find((m) => m.key === metricKey)!;
  const allGpuIndices = useMemo(
    () => [...new Set(data.map((row) => row.index))].toSorted((a, b) => a - b),
    [data],
  );
  // Hidden chips are scoped to the series they were hidden on so switching
  // series never carries over a stale filter.
  const [hiddenSelection, setHiddenSelection] = useState<{
    seriesId: number;
    hidden: number[];
  } | null>(null);
  const hiddenGpus = useMemo(
    () =>
      new Set(
        hiddenSelection && hiddenSelection.seriesId === selectedSeries?.id
          ? hiddenSelection.hidden
          : [],
      ),
    [hiddenSelection, selectedSeries?.id],
  );
  const visibleGpus = useMemo(
    () => new Set(allGpuIndices.filter((gpuIndex) => !hiddenGpus.has(gpuIndex))),
    [allGpuIndices, hiddenGpus],
  );
  const toggleGpu = (gpuIndex: number) => {
    if (!selectedSeries) return;
    track('inference_agentic_power_gpu_toggled', { id, gpuIndex });
    const next = new Set(hiddenGpus);
    if (next.has(gpuIndex)) next.delete(gpuIndex);
    else next.add(gpuIndex);
    setHiddenSelection({ seriesId: selectedSeries.id, hidden: [...next] });
  };
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [display, setDisplay] = useState<TelemetryDisplayState>(DEFAULT_TELEMETRY_DISPLAY);

  // Server-metric overlay. The series are fetched as soon as the tab opens so
  // the menu can list exactly the metrics this point has; one source at a time.
  const metricsQuery = useTraceServerMetrics(id, enabled);
  const serverMetrics = metricsQuery.data;
  const overlaySources = useMemo(() => availableOverlaySources(serverMetrics), [serverMetrics]);
  const [overlaySelection, setOverlaySelection] = useState<{ id: number; key: string } | null>(
    null,
  );
  const overlayKey = overlaySelection?.id === id ? overlaySelection.key : 'none';
  const overlaySource = overlaySources.find((source) => source.key === overlayKey) ?? null;
  // Trace timeslices carry epoch-ns starts, so both series can share wall-clock
  // time. A zero startNs means the trace only has relative time.
  const overlayAbsolute = Boolean(serverMetrics && serverMetrics.startNs > 0);
  const overlay = useMemo<TelemetryOverlaySeries | null>(() => {
    if (!overlaySource || !serverMetrics || !selectedSeries) return null;
    const originMs = overlayAbsolute
      ? serverMetrics.startNs / 1e6
      : new Date(selectedSeries.startedAt).getTime();
    return {
      label: overlaySourceLabel(overlaySource, locale),
      unit: overlaySource.unit,
      color: overlaySource.color,
      points: toAbsoluteMs(overlaySource.points(serverMetrics), originMs),
    };
  }, [overlaySource, serverMetrics, selectedSeries, overlayAbsolute, locale]);
  const overlayNote = ((): string | null => {
    if (metricsQuery.isLoading) return t.overlayLoading;
    if (metricsQuery.isError) return t.overlayError;
    if (overlaySources.length === 0) return t.overlayUnavailable;
    if (!overlay) return null;
    return overlayAbsolute ? t.overlayAligned : t.overlayRelative;
  })();

  if (!enabled) return null;

  if (query.isLoading) {
    return (
      <div
        className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground"
        data-testid="power-telemetry-loading"
      >
        {t.loading}
      </div>
    );
  }
  if (query.isError) {
    return (
      <RetryableQueryError
        message={t.error}
        analyticsEvent="inference_agentic_power_telemetry_retry_clicked"
        onRetry={query.refetch}
        testId="power-telemetry-query-error"
      />
    );
  }
  if (!selectedSeries) {
    return (
      <div
        className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground"
        data-testid="power-telemetry-missing"
      >
        {t.missing.replace('{id}', String(id))}
      </div>
    );
  }

  const durationS = Math.max(
    0,
    (new Date(selectedSeries.endedAt).getTime() - new Date(selectedSeries.startedAt).getTime()) /
      1000,
  );
  const numberLocale = locale === 'zh' ? 'zh-CN' : undefined;

  return (
    <div className="flex flex-col gap-4" data-testid="power-telemetry-view">
      <Card>
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t.vendor}</dt>
            <dd className="font-medium">{collectorLabel(selectedSeries)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t.samples}</dt>
            <dd className="font-medium tabular-nums" data-testid="power-telemetry-sample-count">
              {selectedSeries.sampleCount.toLocaleString(numberLocale)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t.chips}</dt>
            <dd className="font-medium tabular-nums">{selectedSeries.gpuCount}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t.interval}</dt>
            <dd className="font-medium tabular-nums">
              {selectedSeries.sampleIntervalS === null
                ? '—'
                : `${selectedSeries.sampleIntervalS.toFixed(2)} ${t.secondsUnit}`}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">{t.window}</dt>
            <dd className="font-medium tabular-nums">
              {new Date(selectedSeries.startedAt).toLocaleTimeString(numberLocale)} ·{' '}
              {Math.round(durationS).toLocaleString(numberLocale)} {t.secondsUnit}
            </dd>
          </div>
        </dl>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-end gap-3">
          {seriesList.length > 1 && (
            <div className="space-y-1 min-w-0">
              <Label htmlFor="power-telemetry-series-select">{t.series}</Label>
              <Select
                value={String(selectedSeries.id)}
                onValueChange={(value) => {
                  track('inference_agentic_power_series_selected', { id, seriesId: Number(value) });
                  setSeriesSelection({ id, seriesId: Number(value) });
                }}
              >
                <SelectTrigger id="power-telemetry-series-select" className="w-full truncate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {seriesList.map((series) => (
                    <SelectItem key={series.id} value={String(series.id)}>
                      {seriesLabel(series, seriesList.length)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="power-telemetry-metric-select">{t.metric}</Label>
            <Select
              value={metricKey}
              onValueChange={(value) => {
                track('inference_agentic_power_metric_changed', { id, metric: value });
                setMetricSelection(value as GpuMetricKey);
              }}
            >
              <SelectTrigger
                id="power-telemetry-metric-select"
                data-testid="power-telemetry-metric-select"
                className="w-full sm:w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMetrics.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {getGpuMetricLabel(m, locale)} ({m.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <TelemetryDisplayControls
          value={display}
          onChange={setDisplay}
          analyticsPrefix="inference_agentic_power"
          idPrefix="power-telemetry-display"
          className="mt-3 border-t border-border/60 pt-3"
        />
        <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
          <div className="space-y-1">
            <Label htmlFor="power-telemetry-overlay">{t.overlayToggle}</Label>
            <Select
              value={overlayKey}
              disabled={overlaySources.length === 0}
              onValueChange={(value) => {
                track('inference_agentic_power_overlay_changed', { id, source: value });
                setOverlaySelection({ id, key: value });
              }}
            >
              <SelectTrigger
                id="power-telemetry-overlay"
                data-testid="power-telemetry-overlay-select"
                className="w-full sm:w-64"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t.overlayNone}</SelectItem>
                {overlaySources.map((source) => (
                  <SelectItem key={source.key} value={source.key}>
                    {overlaySourceLabel(source, locale)} ({source.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {overlayNote && (
            <span
              className="pb-2 text-xs text-muted-foreground"
              data-testid="power-telemetry-overlay-note"
            >
              {overlayNote}
            </span>
          )}
        </div>
      </Card>

      <Card className="relative" data-testid="power-telemetry-chart">
        <GpuMetricsChart
          data={data}
          visibleGpus={visibleGpus}
          metricKey={metricKey}
          artifactName={selectedSeries.artifactName}
          hardware={hardware}
          maxPoints={2000}
          display={display}
          overlay={overlay}
          legendElement={
            <ChartLegend
              variant="sidebar"
              legendItems={allGpuIndices.map((gpuIndex) => ({
                name: `${t.chip} ${gpuIndex}`,
                hw: String(gpuIndex),
                label: `${t.chip} ${gpuIndex}`,
                color: GPU_COLORS[gpuIndex % GPU_COLORS.length],
                isActive: visibleGpus.has(gpuIndex),
                onClick: () => toggleGpu(gpuIndex),
              }))}
              onItemRemove={(hw) => {
                const gpuIndex = Number(hw);
                if (visibleGpus.has(gpuIndex)) toggleGpu(gpuIndex);
              }}
              isLegendExpanded={isLegendExpanded}
              onExpandedChange={(expanded) => {
                setIsLegendExpanded(expanded);
                track('inference_agentic_power_legend_expanded', { id, expanded });
              }}
              actions={
                hiddenGpus.size === 0
                  ? []
                  : [
                      {
                        id: 'power-telemetry-show-all-chips',
                        label: t.resetFilter,
                        onClick: () => {
                          track('inference_agentic_power_gpu_reset_filter', { id });
                          setHiddenSelection(null);
                        },
                      },
                    ]
              }
            />
          }
          caption={
            <span className="text-xs text-muted-foreground">
              {getGpuMetricLabel(metricConfig, locale)} · {t.sharedNote}
            </span>
          }
        />
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-medium">{t.perGpuStats}</h3>
        <GpuStatsTable data={data} metricKey={metricKey} />
      </Card>
    </div>
  );
}
