'use client';

import { track } from '@/lib/analytics';
import * as d3 from 'd3';
import { BarChart3, Check, Link as LinkIcon, Lock, Loader2, ScatterChart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ChartLegend from '@/components/ui/chart-legend';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { UnofficialDomainNotice } from '@/components/ui/unofficial-domain-notice';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { relockFeatureGate } from '@/lib/use-feature-gate';
import { useLocale } from '@/lib/use-locale';

import GpuCorrelationChart from './GpuCorrelationChart';
import GpuMetricsChart from './GpuPowerChart';
import GpuStatsTable from './GpuStatsTable';
import {
  type GpuMetricKey,
  type GpuMetricsArtifact,
  type GpuPowerApiResponse,
  type GpuPowerRunInfo,
  ALL_METRIC_OPTIONS,
  getAvailableMetrics,
} from './types';

const GPU_COLORS = d3.schemeTableau10;

const STRINGS = {
  en: {
    heading: 'PowerX',
    descPre: 'Enter a GitHub Actions run ID to visualize GPU metrics over time from',
    descPost: 'artifacts.',
    relockButton: 'Re-lock feature gate',
    runIdLabel: 'Run ID',
    runIdPlaceholder: 'e.g. 22806827144',
    loadButton: 'Load',
    loadingButton: 'Loading...',
    runLabel: 'Run:',
    branchLabel: 'Branch:',
    dateLabel: 'Date:',
    statusLabel: 'Status:',
    dataPointsLabel: 'Data points:',
    artifactLabel: 'Artifact',
    metricLabel: 'Metric',
    copied: 'Copied',
    share: 'Share',
    xAxis: 'X Axis',
    yAxis: 'Y Axis',
    metricOverTimeSuffix: ' over Time',
    metricCorrelation: 'Metric Correlation',
    resetFilter: 'Reset filter',
    downsample: 'Downsample',
    perGpuStats: 'Per-GPU Statistics',
    rows: 'rows',
  },
  zh: {
    heading: 'PowerX',
    descPre: '输入 GitHub Actions 运行 ID，可视化',
    descPost: '产物中 GPU 指标的时间变化趋势。',
    relockButton: '重新锁定功能入口',
    runIdLabel: '运行 ID',
    runIdPlaceholder: '例如 22806827144',
    loadButton: '加载',
    loadingButton: '加载中...',
    runLabel: '运行：',
    branchLabel: '分支：',
    dateLabel: '日期：',
    statusLabel: '状态：',
    dataPointsLabel: '数据点：',
    artifactLabel: '产物',
    metricLabel: '指标',
    copied: '已复制',
    share: '分享',
    xAxis: 'X 轴',
    yAxis: 'Y 轴',
    metricOverTimeSuffix: ' 时间趋势',
    metricCorrelation: '指标相关性',
    resetFilter: '重置筛选',
    downsample: '降采样',
    perGpuStats: '每 GPU 统计信息',
    rows: '行',
  },
} as const;

type GpuMetricsView = 'chart' | 'correlation';

const GPU_METRICS_VIEW_OPTIONS: SegmentedToggleOption<GpuMetricsView>[] = [
  {
    value: 'chart',
    icon: <BarChart3 className="size-3.5" />,
    ariaLabel: 'Line chart',
    title: 'Line chart',
  },
  {
    value: 'correlation',
    icon: <ScatterChart className="size-3.5" />,
    ariaLabel: 'Correlation scatter',
    title: 'Correlation scatter',
  },
];

export default function GpuMetricsDisplay() {
  const router = useRouter();
  const t = STRINGS[useLocale()];
  const [runIdInput, setRunIdInput] = useState('22806827144');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<GpuMetricsArtifact[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<string>('');
  const [selectedMetric, setSelectedMetric] = useState<GpuMetricKey>('power');
  const [runInfo, setRunInfo] = useState<GpuPowerRunInfo | null>(null);
  const [visibleGpus, setVisibleGpus] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [downsample, setDownsample] = useState(true);
  // View toggle + correlation
  const [chartView, setChartView] = useState<GpuMetricsView>('chart');
  const [corrXMetric, setCorrXMetric] = useState<GpuMetricKey>('power');
  const [corrYMetric, setCorrYMetric] = useState<GpuMetricKey>('temperature');
  // URL state
  const pendingUrlState = useRef<{ artifact?: string; metric?: string } | null>(null);

  const loadRun = useCallback(
    async (runId: string, urlDefaults?: { artifact?: string; metric?: string }) => {
      track('gpu_metrics_load_run', { runId });
      setLoading(true);
      setError(null);
      if (urlDefaults) {
        pendingUrlState.current = urlDefaults;
      }
      try {
        const response = await fetch(`/api/gpu-metrics?runId=${encodeURIComponent(runId)}`);
        const result: GpuPowerApiResponse | { error: string } = await response.json();
        if (!response.ok) {
          throw new Error('error' in result ? result.error : 'Failed to fetch GPU metrics');
        }
        const apiResult = result as GpuPowerApiResponse;
        setArtifacts(apiResult.artifacts);
        setRunInfo(apiResult.runInfo);

        const pending = pendingUrlState.current;
        const targetArtifact =
          pending?.artifact && apiResult.artifacts.some((a) => a.name === pending.artifact)
            ? pending.artifact
            : (apiResult.artifacts[0]?.name ?? '');
        setSelectedArtifact(targetArtifact);

        if (pending?.metric && ALL_METRIC_OPTIONS.some((m) => m.key === pending.metric)) {
          setSelectedMetric(pending.metric as GpuMetricKey);
        }
        pendingUrlState.current = null;

        const targetData = apiResult.artifacts.find((a) => a.name === targetArtifact)?.data ?? [];
        const gpuIndices = new Set(targetData.map((d) => d.index));
        setVisibleGpus(gpuIndices);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Unknown error');
        setArtifacts([]);
        setRunInfo(null);
        setSelectedArtifact('');
        pendingUrlState.current = null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleLoad = useCallback(() => {
    const trimmed = runIdInput.trim();
    if (!trimmed) return;
    loadRun(trimmed);
  }, [runIdInput, loadRun]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlRunId = params.get('gm_runId');
    if (!urlRunId) return;
    setRunIdInput(urlRunId);
    loadRun(urlRunId, {
      artifact: params.get('gm_artifact') ?? undefined,
      metric: params.get('gm_metric') ?? undefined,
    });
  }, [loadRun]);

  const handleArtifactChange = useCallback(
    (name: string) => {
      track('gpu_metrics_artifact_selected', { artifact: name });
      setSelectedArtifact(name);
      const artifact = artifacts.find((a) => a.name === name);
      if (artifact) {
        setVisibleGpus(new Set(artifact.data.map((d) => d.index)));
        // Reset metric if current selection isn't available in new artifact
        const available = getAvailableMetrics(artifact.data);
        setSelectedMetric((prev) => (available.some((m) => m.key === prev) ? prev : 'power'));
      }
    },
    [artifacts],
  );

  const handleMetricChange = useCallback((value: string) => {
    track('gpu_metrics_metric_changed', { metric: value });
    setSelectedMetric(value as GpuMetricKey);
  }, []);

  const currentData = useMemo(
    () => artifacts.find((a) => a.name === selectedArtifact)?.data ?? [],
    [artifacts, selectedArtifact],
  );

  const availableMetrics = useMemo(() => getAvailableMetrics(currentData), [currentData]);

  const toggleGpu = useCallback((gpuIndex: number) => {
    track('gpu_metrics_gpu_toggled', { gpuIndex });
    setVisibleGpus((prev) => {
      const next = new Set(prev);
      if (next.has(gpuIndex)) {
        next.delete(gpuIndex);
      } else {
        next.add(gpuIndex);
      }
      return next;
    });
  }, []);

  const removeGpu = useCallback((hw: string) => {
    setVisibleGpus((prev) => {
      const next = new Set(prev);
      next.delete(Number(hw));
      return next;
    });
  }, []);

  const handleShare = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('gm_runId', runIdInput.trim());
    if (selectedArtifact) params.set('gm_artifact', selectedArtifact);
    if (selectedMetric !== 'power') params.set('gm_metric', selectedMetric);
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}#gpu-metrics`;
    track('gpu_metrics_share_link_copied', {
      runId: runIdInput.trim(),
      artifact: selectedArtifact,
      metric: selectedMetric,
    });
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.append(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    window.dispatchEvent(new CustomEvent('inferencex:action'));
  }, [runIdInput, selectedArtifact, selectedMetric]);

  const metricConfig = ALL_METRIC_OPTIONS.find((m) => m.key === selectedMetric)!;

  const allGpuIndices = useMemo(
    () => [...new Set(currentData.map((d) => d.index))].toSorted((a, b) => a - b),
    [currentData],
  );

  const allGpusSelected =
    allGpuIndices.length > 0 && allGpuIndices.every((i) => visibleGpus.has(i));
  const selectAllGpus = useCallback(() => {
    setVisibleGpus(new Set(allGpuIndices));
    track('gpu_metrics_gpu_reset_filter');
  }, [allGpuIndices]);

  const handleChartViewChange = useCallback((value: GpuMetricsView) => {
    setChartView(value);
    track('gpu_metrics_view_changed', { view: value });
  }, []);

  return (
    <section data-testid="gpu-metrics-display">
      <Card className="mb-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-2">{t.heading}</h2>
              <p className="text-muted-foreground text-sm">
                {t.descPre}{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">gpu_metrics</code>{' '}
                {t.descPost}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => {
                  relockFeatureGate();
                  track('powerx_relocked');
                  router.push('/inference');
                }}
                title="Re-lock feature gate"
              >
                <Lock className="size-3" />
                {t.relockButton}
              </Button>
              <ChartShareActions />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 max-w-sm space-y-1">
              <Label htmlFor="gpu-metrics-run-id">{t.runIdLabel}</Label>
              <Input
                id="gpu-metrics-run-id"
                data-testid="gpu-metrics-run-input"
                placeholder={t.runIdPlaceholder}
                value={runIdInput}
                onChange={(e) => setRunIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLoad();
                }}
              />
            </div>
            <Button
              data-testid="gpu-metrics-load-button"
              onClick={handleLoad}
              disabled={!runIdInput.trim() || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t.loadingButton}
                </>
              ) : (
                t.loadButton
              )}
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <Card className="mb-4 border-destructive" data-testid="gpu-metrics-error">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {runInfo && artifacts.length > 0 && (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mb-4">
              <span>
                <span className="text-muted-foreground">{t.runLabel}</span>{' '}
                <a
                  href={runInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline font-medium"
                >
                  {runInfo.name} #{runInfo.id}
                </a>
              </span>
              <span>
                <span className="text-muted-foreground">{t.branchLabel}</span> {runInfo.branch}
              </span>
              <span>
                <span className="text-muted-foreground">{t.dateLabel}</span>{' '}
                {new Date(runInfo.createdAt).toLocaleDateString()}
              </span>
              <span>
                <span className="text-muted-foreground">{t.statusLabel}</span> {runInfo.conclusion}
              </span>
              <span>
                <span className="text-muted-foreground">{t.dataPointsLabel}</span>{' '}
                {currentData.length.toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-end gap-3">
              {artifacts.length > 1 && (
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="gpu-metrics-artifact-select">{t.artifactLabel}</Label>
                  <Select value={selectedArtifact} onValueChange={handleArtifactChange}>
                    <SelectTrigger
                      id="gpu-metrics-artifact-select"
                      data-testid="gpu-metrics-artifact-select"
                      className="w-full truncate"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {artifacts.map((a) => (
                        <SelectItem key={a.name} value={a.name}>
                          {a.name} ({a.data.length.toLocaleString()} {t.rows})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="gpu-metrics-metric-select">{t.metricLabel}</Label>
                <Select value={selectedMetric} onValueChange={handleMetricChange}>
                  <SelectTrigger
                    id="gpu-metrics-metric-select"
                    data-testid="gpu-metrics-metric-select"
                    className="w-[200px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMetrics.map((m) => (
                      <SelectItem key={m.key} value={m.key}>
                        {m.label} ({m.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card
            id="gpu-metrics-chart"
            data-testid="gpu-metrics-chart-container"
            className="relative"
          >
            <div className="flex items-center justify-end mb-2">
              <div className="flex items-center gap-1.5 no-export">
                <SegmentedToggle
                  value={chartView}
                  options={GPU_METRICS_VIEW_OPTIONS}
                  onValueChange={handleChartViewChange}
                  ariaLabel="View mode"
                  className="rounded-md border p-0 gap-0"
                  buttonClassName="p-1.5 rounded-none first:rounded-l-md last:rounded-r-md"
                  activeButtonClassName="bg-muted text-foreground"
                  inactiveButtonClassName="text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  className="h-7 gap-1.5 text-xs"
                  title="Copy share link"
                  data-testid="gpu-metrics-share-button"
                >
                  {copied ? (
                    <>
                      <Check className="size-3" />
                      {t.copied}
                    </>
                  ) : (
                    <>
                      <LinkIcon className="size-3" />
                      {t.share}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {chartView === 'correlation' && (
              <div className="flex flex-wrap items-end gap-3 mb-3 no-export">
                <div className="space-y-1">
                  <Label className="text-xs">{t.xAxis}</Label>
                  <Select
                    value={corrXMetric}
                    onValueChange={(v) => setCorrXMetric(v as GpuMetricKey)}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMetrics.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.yAxis}</Label>
                  <Select
                    value={corrYMetric}
                    onValueChange={(v) => setCorrYMetric(v as GpuMetricKey)}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMetrics.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {chartView === 'chart' && (
              <GpuMetricsChart
                data={currentData}
                visibleGpus={visibleGpus}
                metricKey={selectedMetric}
                artifactName={selectedArtifact}
                maxPoints={downsample ? 2000 : Infinity}
                caption={
                  <>
                    <h2 className="text-lg font-semibold">
                      {metricConfig.label}
                      {t.metricOverTimeSuffix}
                    </h2>
                    <UnofficialDomainNotice />
                  </>
                }
                legendElement={
                  <ChartLegend
                    variant="sidebar"
                    onItemRemove={removeGpu}
                    legendItems={allGpuIndices.map((gpuIndex) => ({
                      name: `GPU ${gpuIndex}`,
                      hw: String(gpuIndex),
                      label: `GPU ${gpuIndex}`,
                      color: GPU_COLORS[gpuIndex % GPU_COLORS.length],
                      isActive: visibleGpus.has(gpuIndex),
                      onClick: () => toggleGpu(gpuIndex),
                    }))}
                    isLegendExpanded={isLegendExpanded}
                    onExpandedChange={(expanded) => {
                      setIsLegendExpanded(expanded);
                      track('gpu_metrics_legend_expanded', { expanded });
                    }}
                    actions={
                      allGpusSelected
                        ? []
                        : [
                            {
                              id: 'gpu-metrics-reset-filter',
                              label: t.resetFilter,
                              onClick: selectAllGpus,
                            },
                          ]
                    }
                    switches={[
                      {
                        id: 'gpu-metrics-downsample',
                        label: t.downsample,
                        checked: downsample,
                        onCheckedChange: (c) => {
                          setDownsample(c);
                          track('gpu_metrics_downsample_toggled', { enabled: c });
                        },
                      },
                    ]}
                  />
                }
              />
            )}
            {chartView === 'correlation' && (
              <GpuCorrelationChart
                data={currentData}
                visibleGpus={visibleGpus}
                xMetric={corrXMetric}
                yMetric={corrYMetric}
                maxPoints={downsample ? 2000 : Infinity}
                caption={
                  <>
                    <h2 className="text-lg font-semibold">{t.metricCorrelation}</h2>
                    <UnofficialDomainNotice />
                  </>
                }
                legendElement={
                  <ChartLegend
                    variant="sidebar"
                    onItemRemove={removeGpu}
                    legendItems={allGpuIndices.map((gpuIndex) => ({
                      name: `GPU ${gpuIndex}`,
                      hw: String(gpuIndex),
                      label: `GPU ${gpuIndex}`,
                      color: GPU_COLORS[gpuIndex % GPU_COLORS.length],
                      isActive: visibleGpus.has(gpuIndex),
                      onClick: () => toggleGpu(gpuIndex),
                    }))}
                    isLegendExpanded={isLegendExpanded}
                    onExpandedChange={(expanded) => {
                      setIsLegendExpanded(expanded);
                      track('gpu_metrics_legend_expanded', { expanded });
                    }}
                    actions={
                      allGpusSelected
                        ? []
                        : [
                            {
                              id: 'gpu-metrics-reset-filter-2',
                              label: t.resetFilter,
                              onClick: selectAllGpus,
                            },
                          ]
                    }
                    switches={[
                      {
                        id: 'gpu-metrics-downsample-corr',
                        label: t.downsample,
                        checked: downsample,
                        onCheckedChange: (c) => {
                          setDownsample(c);
                          track('gpu_metrics_downsample_toggled', { enabled: c });
                        },
                      },
                    ]}
                  />
                }
              />
            )}
          </Card>

          {/* Statistics Table */}
          <Card className="mt-4">
            <h3 className="text-sm font-semibold mb-2">
              {t.perGpuStats} ({metricConfig.label})
            </h3>
            <GpuStatsTable data={currentData} metricKey={selectedMetric} />
          </Card>
        </>
      )}
    </section>
  );
}
