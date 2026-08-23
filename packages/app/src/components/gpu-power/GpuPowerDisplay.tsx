'use client';

import { useQuery } from '@tanstack/react-query';
import { track } from '@/lib/analytics';
import * as d3 from 'd3';
import { BarChart3, Check, Link as LinkIcon, Lock, Loader2, ScatterChart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

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

import { localePath } from '@/lib/i18n';
import { relockFeatureGate } from '@/lib/use-feature-gate';
import { useLocale } from '@/lib/use-locale';
import { useClientSearchParams } from '@/hooks/useClientSearch';

import GpuCorrelationChart from './GpuCorrelationChart';
import GpuMetricsChart from './GpuPowerChart';
import GpuStatsTable from './GpuStatsTable';
import {
  type GpuMetricKey,
  type GpuPowerApiResponse,
  ALL_METRIC_OPTIONS,
  getGpuMetricLabel,
  getAvailableMetrics,
} from './types';

const GPU_COLORS = d3.schemeTableau10;

const STRINGS = {
  en: {
    heading: 'PowerX',
    descPre: 'Enter a GitHub Actions run ID to visualize chip metrics over time from',
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
    perGpuStats: 'Per-Chip Statistics',
    rows: 'rows',
    error: 'Failed to load chip metrics.',
    numericError: 'Run ID must be numeric.',
    retry: 'Retry',
    empty: 'This run has no chip metrics artifacts to display.',
    viewMode: 'View mode',
    lineChart: 'Line chart',
    correlationScatter: 'Correlation scatter',
    shareTitle: 'Copy share link',
    chip: 'Chip',
  },
  zh: {
    heading: 'PowerX',
    descPre: '输入 GitHub Actions 运行 ID，可视化',
    descPost: '产物中芯片指标的时间变化趋势。',
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
    perGpuStats: '每芯片统计信息',
    rows: '行',
    error: '无法加载芯片指标。',
    numericError: '运行 ID 必须为数字。',
    retry: '重试',
    empty: '该运行没有可显示的芯片指标产物。',
    viewMode: '显示模式',
    lineChart: '折线图',
    correlationScatter: '相关性散点图',
    shareTitle: '复制分享链接',
    chip: '芯片',
  },
} as const;

type GpuMetricsView = 'chart' | 'correlation';

async function fetchGpuPowerRun(runId: string, signal: AbortSignal): Promise<GpuPowerApiResponse> {
  const response = await fetch(`/api/gpu-metrics?runId=${encodeURIComponent(runId)}`, {
    cache: 'no-store',
    signal,
  });
  const result = (await response.json()) as GpuPowerApiResponse | { error: string };
  if (!response.ok) {
    throw new Error('error' in result ? result.error : 'Failed to fetch chip metrics');
  }
  return result as GpuPowerApiResponse;
}

export default function GpuMetricsDisplay() {
  const router = useRouter();
  const locale = useLocale();
  const t = STRINGS[locale];
  const searchParams = useClientSearchParams();
  const searchKey = searchParams.toString();
  const urlRunId = searchParams.get('gm_runId')?.trim() || null;
  const [runIdDraft, setRunIdDraft] = useState<{ searchKey: string; value: string } | null>(null);
  const runIdInput =
    runIdDraft?.searchKey === searchKey ? runIdDraft.value : (urlRunId ?? '22806827144');
  const [submittedRun, setSubmittedRun] = useState<{
    searchKey: string;
    runId: string;
  } | null>(null);
  const requestedRunId = submittedRun?.searchKey === searchKey ? submittedRun.runId : urlRunId;
  const query = useQuery({
    queryKey: ['gpu-power-run', requestedRunId] as const,
    queryFn: ({ signal }) => fetchGpuPowerRun(requestedRunId!, signal),
    enabled: Boolean(requestedRunId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: 'always',
  });
  const artifacts = query.data?.artifacts ?? [];
  const runInfo = query.data?.runInfo ?? null;
  const loading = Boolean(requestedRunId) && query.isFetching;
  const error = query.error
    ? /^\d+$/u.test(requestedRunId ?? '')
      ? t.error
      : t.numericError
    : null;

  const [selection, setSelection] = useState<{
    searchKey: string;
    runId: string;
    artifact?: string;
    metric?: GpuMetricKey;
  } | null>(null);
  const selectionApplies = selection?.searchKey === searchKey && selection.runId === requestedRunId;
  const selectedArtifactCandidate = selectionApplies
    ? selection.artifact
    : (searchParams.get('gm_artifact') ?? undefined);
  const selectedArtifact =
    selectedArtifactCandidate &&
    artifacts.some((artifact) => artifact.name === selectedArtifactCandidate)
      ? selectedArtifactCandidate
      : (artifacts[0]?.name ?? '');
  const currentData = useMemo(
    () => artifacts.find((artifact) => artifact.name === selectedArtifact)?.data ?? [],
    [artifacts, selectedArtifact],
  );
  const availableMetrics = useMemo(() => getAvailableMetrics(currentData), [currentData]);
  const urlMetric = searchParams.get('gm_metric');
  const selectedMetricCandidate = selectionApplies ? selection.metric : urlMetric;
  const selectedMetric =
    selectedMetricCandidate &&
    ALL_METRIC_OPTIONS.some((metric) => metric.key === selectedMetricCandidate) &&
    availableMetrics.some((metric) => metric.key === selectedMetricCandidate)
      ? (selectedMetricCandidate as GpuMetricKey)
      : 'power';

  const [gpuSelection, setGpuSelection] = useState<{
    scopeKey: string;
    values: Set<number>;
  } | null>(null);
  const allGpuIndices = useMemo(
    () => [...new Set(currentData.map((datum) => datum.index))].toSorted((a, b) => a - b),
    [currentData],
  );
  const gpuScopeKey = `${requestedRunId ?? ''}|${selectedArtifact}`;
  const visibleGpus = useMemo(
    () =>
      gpuSelection?.scopeKey === gpuScopeKey
        ? new Set(gpuSelection.values)
        : new Set(allGpuIndices),
    [gpuSelection, gpuScopeKey, allGpuIndices],
  );

  const [copied, setCopied] = useState(false);
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [downsample, setDownsample] = useState(true);
  const [chartView, setChartView] = useState<GpuMetricsView>('chart');
  const [corrXMetric, setCorrXMetric] = useState<GpuMetricKey>('power');
  const [corrYMetric, setCorrYMetric] = useState<GpuMetricKey>('temperature');
  const viewOptions = useMemo<SegmentedToggleOption<GpuMetricsView>[]>(
    () => [
      {
        value: 'chart',
        icon: <BarChart3 className="size-3.5" />,
        ariaLabel: t.lineChart,
        title: t.lineChart,
      },
      {
        value: 'correlation',
        icon: <ScatterChart className="size-3.5" />,
        ariaLabel: t.correlationScatter,
        title: t.correlationScatter,
      },
    ],
    [t],
  );

  const handleLoad = useCallback(() => {
    const runId = runIdInput.trim();
    if (!runId) return;
    track('gpu_metrics_load_run', { runId });
    if (runId === requestedRunId) {
      void query.refetch();
      return;
    }
    setSubmittedRun({ searchKey, runId });
  }, [runIdInput, requestedRunId, query, searchKey]);

  const handleArtifactChange = useCallback(
    (name: string) => {
      track('gpu_metrics_artifact_selected', { artifact: name });
      const artifact = artifacts.find((candidate) => candidate.name === name);
      const metrics = getAvailableMetrics(artifact?.data ?? []);
      setSelection({
        searchKey,
        runId: requestedRunId ?? '',
        artifact: name,
        metric: metrics.some((metric) => metric.key === selectedMetric) ? selectedMetric : 'power',
      });
    },
    [artifacts, requestedRunId, searchKey, selectedMetric],
  );

  const handleMetricChange = useCallback(
    (value: string) => {
      track('gpu_metrics_metric_changed', { metric: value });
      setSelection({
        searchKey,
        runId: requestedRunId ?? '',
        artifact: selectedArtifact,
        metric: value as GpuMetricKey,
      });
    },
    [requestedRunId, searchKey, selectedArtifact],
  );

  const toggleGpu = useCallback(
    (gpuIndex: number) => {
      track('gpu_metrics_gpu_toggled', { gpuIndex });
      const next = new Set(visibleGpus);
      if (next.has(gpuIndex)) next.delete(gpuIndex);
      else next.add(gpuIndex);
      setGpuSelection({ scopeKey: gpuScopeKey, values: next });
    },
    [gpuScopeKey, visibleGpus],
  );

  const removeGpu = useCallback(
    (hw: string) => {
      const next = new Set(visibleGpus);
      next.delete(Number(hw));
      setGpuSelection({ scopeKey: gpuScopeKey, values: next });
    },
    [gpuScopeKey, visibleGpus],
  );

  const handleShare = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('gm_runId', requestedRunId ?? runIdInput.trim());
    if (selectedArtifact) params.set('gm_artifact', selectedArtifact);
    if (selectedMetric !== 'power') params.set('gm_metric', selectedMetric);
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}#gpu-metrics`;
    track('gpu_metrics_share_link_copied', {
      runId: requestedRunId ?? runIdInput.trim(),
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
  }, [requestedRunId, runIdInput, selectedArtifact, selectedMetric]);

  const metricConfig = ALL_METRIC_OPTIONS.find((metric) => metric.key === selectedMetric)!;
  const allGpusSelected =
    allGpuIndices.length > 0 && allGpuIndices.every((index) => visibleGpus.has(index));
  const selectAllGpus = useCallback(() => {
    setGpuSelection({ scopeKey: gpuScopeKey, values: new Set(allGpuIndices) });
    track('gpu_metrics_gpu_reset_filter');
  }, [allGpuIndices, gpuScopeKey]);

  const handleChartViewChange = useCallback((value: GpuMetricsView) => {
    setChartView(value);
    track('gpu_metrics_view_changed', { view: value });
  }, []);

  const handleCorrelationMetricChange = useCallback((axis: 'x' | 'y', value: string) => {
    track('gpu_metrics_correlation_metric_changed', { axis, metric: value });
    if (axis === 'x') setCorrXMetric(value as GpuMetricKey);
    else setCorrYMetric(value as GpuMetricKey);
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
                  router.push(localePath('/inference', locale));
                }}
                title={t.relockButton}
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
                onChange={(event) => setRunIdDraft({ searchKey, value: event.target.value })}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                track('gpu_metrics_retry_clicked', { runId: requestedRunId });
                void query.refetch();
              }}
            >
              {t.retry}
            </Button>
          </div>
        </Card>
      )}

      {runInfo && artifacts.length === 0 && !error && (
        <Card className="mb-4" data-testid="gpu-metrics-empty">
          <p className="text-sm text-muted-foreground">{t.empty}</p>
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
                {locale === 'zh'
                  ? new Date(runInfo.createdAt).toLocaleDateString('zh-CN')
                  : new Date(runInfo.createdAt).toLocaleDateString()}
              </span>
              <span>
                <span className="text-muted-foreground">{t.statusLabel}</span> {runInfo.conclusion}
              </span>
              <span>
                <span className="text-muted-foreground">{t.dataPointsLabel}</span>{' '}
                {locale === 'zh'
                  ? currentData.length.toLocaleString('zh-CN')
                  : currentData.length.toLocaleString()}
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
                        {getGpuMetricLabel(m, locale)} ({m.unit})
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
                  options={viewOptions}
                  onValueChange={handleChartViewChange}
                  ariaLabel={t.viewMode}
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
                  title={t.shareTitle}
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
                    onValueChange={(v) => handleCorrelationMetricChange('x', v)}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMetrics.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {getGpuMetricLabel(m, locale)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.yAxis}</Label>
                  <Select
                    value={corrYMetric}
                    onValueChange={(v) => handleCorrelationMetricChange('y', v)}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMetrics.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {getGpuMetricLabel(m, locale)}
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
                      {getGpuMetricLabel(metricConfig, locale)}
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
                      name: `${t.chip} ${gpuIndex}`,
                      hw: String(gpuIndex),
                      label: `${t.chip} ${gpuIndex}`,
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
                      name: `${t.chip} ${gpuIndex}`,
                      hw: String(gpuIndex),
                      label: `${t.chip} ${gpuIndex}`,
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
              {t.perGpuStats} ({getGpuMetricLabel(metricConfig, locale)})
            </h3>
            <GpuStatsTable data={currentData} metricKey={selectedMetric} />
          </Card>
        </>
      )}
    </section>
  );
}
