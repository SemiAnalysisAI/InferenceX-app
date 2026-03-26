'use client';

import { track } from '@/lib/analytics';
import * as d3 from 'd3';
import { BarChart3, Check, Link as LinkIcon, Lock, Loader2, ScatterChart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ChartLegend from '@/components/ui/chart-legend';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import GpuCorrelationChart from './GpuCorrelationChart';
import GpuMetricsChart from './GpuPowerChart';
import GpuStatsTable from './GpuStatsTable';
import type {
  GpuMetricKey,
  GpuMetricsArtifact,
  GpuPowerApiResponse,
  GpuPowerRunInfo,
} from './types';
import { ALL_METRIC_OPTIONS, getAvailableMetrics } from './types';

const GPU_COLORS = d3.schemeTableau10;
const FEATURE_GATE_KEY = 'inferencex-feature-gate';

export default function GpuMetricsDisplay() {
  const router = useRouter();
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
  const [chartView, setChartView] = useState<'chart' | 'correlation'>('chart');
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
          pending?.artifact && apiResult.artifacts.find((a) => a.name === pending.artifact)
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
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error');
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

  const currentData = useMemo(() => {
    return artifacts.find((a) => a.name === selectedArtifact)?.data ?? [];
  }, [artifacts, selectedArtifact]);

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
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    window.dispatchEvent(new CustomEvent('inferencex:action'));
  }, [runIdInput, selectedArtifact, selectedMetric]);

  const metricConfig = ALL_METRIC_OPTIONS.find((m) => m.key === selectedMetric)!;

  const allGpuIndices = useMemo(
    () => Array.from(new Set(currentData.map((d) => d.index))).sort((a, b) => a - b),
    [currentData],
  );

  const allGpusSelected =
    allGpuIndices.length > 0 && allGpuIndices.every((i) => visibleGpus.has(i));
  const selectAllGpus = useCallback(() => {
    setVisibleGpus(new Set(allGpuIndices));
    track('gpu_metrics_gpu_reset_filter');
  }, [allGpuIndices]);

  return (
    <section data-testid="gpu-metrics-display">
      <Card className="mb-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">PowerX</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              onClick={() => {
                localStorage.removeItem(FEATURE_GATE_KEY);
                window.dispatchEvent(new Event('inferencex:powerx:locked'));
                track('powerx_relocked');
                router.push('/inference');
              }}
              title="Re-lock PowerX"
            >
              <Lock className="h-3 w-3" />
              Lock
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter a GitHub Actions run ID to visualize GPU metrics over time from{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">gpu_metrics</code> artifacts.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 max-w-sm space-y-1">
              <Label htmlFor="gpu-metrics-run-id">Run ID</Label>
              <Input
                id="gpu-metrics-run-id"
                data-testid="gpu-metrics-run-input"
                placeholder="e.g. 22806827144"
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load'
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
                <span className="text-muted-foreground">Run:</span>{' '}
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
                <span className="text-muted-foreground">Branch:</span> {runInfo.branch}
              </span>
              <span>
                <span className="text-muted-foreground">Date:</span>{' '}
                {new Date(runInfo.createdAt).toLocaleDateString()}
              </span>
              <span>
                <span className="text-muted-foreground">Status:</span> {runInfo.conclusion}
              </span>
              <span>
                <span className="text-muted-foreground">Data points:</span>{' '}
                {currentData.length.toLocaleString()}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-end gap-3">
              {artifacts.length > 1 && (
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="gpu-metrics-artifact-select">Artifact</Label>
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
                          {a.name} ({a.data.length.toLocaleString()} rows)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="gpu-metrics-metric-select">Metric</Label>
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
                {/* View toggle */}
                <div className="flex items-center border rounded-md" role="tablist">
                  <button
                    role="tab"
                    aria-selected={chartView === 'chart'}
                    className={`p-1.5 ${chartView === 'chart' ? 'bg-muted' : 'hover:bg-muted/50'} rounded-l-md`}
                    onClick={() => {
                      setChartView('chart');
                      track('gpu_metrics_view_changed', { view: 'chart' });
                    }}
                    title="Line chart"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    role="tab"
                    aria-selected={chartView === 'correlation'}
                    className={`p-1.5 ${chartView === 'correlation' ? 'bg-muted' : 'hover:bg-muted/50'} rounded-r-md`}
                    onClick={() => {
                      setChartView('correlation');
                      track('gpu_metrics_view_changed', { view: 'correlation' });
                    }}
                    title="Correlation scatter"
                  >
                    <ScatterChart className="h-3.5 w-3.5" />
                  </button>
                </div>
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
                      <Check className="h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <LinkIcon className="h-3 w-3" />
                      Share
                    </>
                  )}
                </Button>
              </div>
            </div>

            {chartView === 'correlation' && (
              <div className="flex flex-wrap items-end gap-3 mb-3 no-export">
                <div className="space-y-1">
                  <Label className="text-xs">X Axis</Label>
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
                  <Label className="text-xs">Y Axis</Label>
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
                caption={<h2 className="text-lg font-semibold">{metricConfig.label} over Time</h2>}
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
                    showResetFilter
                    allSelected={allGpusSelected}
                    onResetFilter={selectAllGpus}
                    switches={[
                      {
                        id: 'gpu-metrics-downsample',
                        label: 'Downsample',
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
                caption={<h2 className="text-lg font-semibold">Metric Correlation</h2>}
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
                    showResetFilter
                    allSelected={allGpusSelected}
                    onResetFilter={selectAllGpus}
                    switches={[
                      {
                        id: 'gpu-metrics-downsample-corr',
                        label: 'Downsample',
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
              Per-GPU Statistics ({metricConfig.label})
            </h3>
            <GpuStatsTable data={currentData} metricKey={selectedMetric} />
          </Card>
        </>
      )}
    </section>
  );
}
