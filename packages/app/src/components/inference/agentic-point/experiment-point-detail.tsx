'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

import type { ExperimentPointMetricsResponse } from '@/lib/benchmarks/experiment-point-metrics';
import { experimentQualificationNote } from '@/lib/benchmarks/experiment-benchmarks';
import { useLocale } from '@/lib/i18n/use-locale';
import { EmptyState } from '@/components/ui/empty-state';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { MetricSourceToolbar } from './metric-source-toolbar';
import {
  phaseBoundarySec,
  sliceRequestChartDataByPhase,
  sliceServerSeriesByPhase,
  timelineHasWarmup,
  type ServerSeriesLike,
  type StagePhase,
} from './phase-slice';
import { RequestMetricOverTime, SequenceMetricCard } from './request-metric-cards';
import {
  InflightUniqueTokensCard,
  KvCacheUtilizationCard,
  PrefixCacheHitRateCard,
  PromptTokenSourceCard,
  RequestActivityCard,
  ThroughputCard,
  type RequestActivityView,
} from './server-metric-cards';
import type { ThroughputSeriesKey } from './time-series-math';
import { useDetailView } from './use-detail-view';
import { ExperimentSiblingNav } from './experiment-sibling-nav';

const RequestTimelineView = dynamic(() =>
  import('./request-timeline').then((m) => m.RequestTimelineView),
);
const STRINGS = {
  en: {
    back: 'Inference chart',
    loading: 'Loading point metrics…',
    error: 'Failed to load point metrics',
    missing: 'No stored metrics for this run.',
    point: 'Per-point',
    timeline: 'Request timeline',
    configuration: 'Configuration',
    view: 'Detail view',
    concurrency: 'Concurrency',
    interactivity: 'Interactivity over time',
    ttft: 'TTFT over time',
    noTimeline: 'No stored request timeline.',
    warmup:
      'Warmup outputs are capped at 1 token; interactivity and decode metrics are blank for single-token outputs.',
  },
  zh: {
    back: '推理图表',
    loading: '正在加载数据点指标……',
    error: '无法加载数据点指标',
    missing: '该运行没有存储的指标。',
    point: '单点',
    timeline: '请求时间线',
    configuration: '配置',
    view: '详情视图',
    concurrency: '并发数',
    interactivity: '交互性随时间变化',
    ttft: 'TTFT 随时间变化',
    noTimeline: '没有存储的请求时间线。',
    warmup: 'Warmup 输出限制为 1 个 token；单 token 输出的交互性和解码指标为空。',
  },
} as const;

export function ExperimentPointDetail({ campaign, runId }: { campaign: string; runId: string }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const endpoint = `/api/v1/experiments/${encodeURIComponent(campaign)}/runs/${encodeURIComponent(runId)}`;
  const query = useQuery({
    queryKey: ['experiment-point-metrics', campaign, runId],
    queryFn: async ({ signal }): Promise<ExperimentPointMetricsResponse | null> => {
      const response = await fetch(`${endpoint}/metrics`, { signal, cache: 'no-store' });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Point metrics unavailable (${response.status})`);
      return response.json();
    },
    staleTime: 0,
    retry: 1,
  });
  const data = query.data;
  const metrics = data?.serverMetrics;
  const requests = data?.requestChartData;
  const [requestedView, setView] = useDetailView();
  const view = requestedView === 'timeline' ? 'timeline' : 'point';
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [phase, setPhase] = useState<StagePhase>('profiling');
  const [metricSourceId, setMetricSourceId] = useState('all');
  const [activityView, setActivityView] = useState<RequestActivityView>('queue');
  const [throughputSeries, setThroughputSeries] = useState<ReadonlySet<ThroughputSeriesKey>>(
    () => new Set(['input', 'decode']),
  );
  const hasWarmup = useMemo(() => timelineHasWarmup(requests), [requests]);
  const effectivePhase = hasWarmup ? phase : 'profiling';
  const boundarySec = useMemo(() => phaseBoundarySec(metrics, requests), [metrics, requests]);
  const phaseRequests = useMemo(
    () => (requests ? sliceRequestChartDataByPhase(requests, effectivePhase) : null),
    [requests, effectivePhase],
  );
  const selectedSource = metrics?.metricSources.find(({ source }) => source.id === metricSourceId);
  const baseSeries: ServerSeriesLike | undefined = useMemo(() => {
    if (metricSourceId === 'all') return metrics ?? undefined;
    const source = data?.metricSourceSeries.find((entry) => entry.source.id === metricSourceId);
    return source
      ? { ...source, prefillTps: source.promptTps, decodeTps: source.generationTps }
      : undefined;
  }, [data?.metricSourceSeries, metrics, metricSourceId]);
  const sliced = useMemo(
    () =>
      baseSeries
        ? sliceServerSeriesByPhase(baseSeries, effectivePhase, boundarySec, metrics?.durationS ?? 0)
        : null,
    [baseSeries, effectivePhase, boundarySec, metrics?.durationS],
  );
  const backHref = `${locale === 'zh' ? '/zh' : ''}/infx/inference/kimi-k3?experiment=${encodeURIComponent(campaign)}&i_seq=agentic-traces&i_tokens=uncached&i_metric=y_tpPerGpu&i_best=0&i_optimal=0`;
  const qualification = data
    ? experimentQualificationNote(
        {
          campaign,
          runId,
          replicate: null,
          frontierEligible: data.run.frontier_eligible,
          detailHref: endpoint,
          qualificationCode:
            typeof data.run.health.qualification_code === 'string'
              ? data.run.health.qualification_code
              : undefined,
        },
        locale,
      )
    : '';

  return (
    <div className="flex flex-col gap-6" data-testid="experiment-point-detail">
      <Link
        href={backHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.back}
      </Link>
      <ExperimentSiblingNav campaign={campaign} runId={runId} />
      <header className="space-y-1">
        <p className="break-words text-sm font-medium">{data?.run.config_name || runId}</p>
        {data && (
          <p className="text-sm text-muted-foreground">
            {data.run.series === 'weka' ? 'WEKA AMG' : 'Internal Mooncake DRAM'} · {t.concurrency}{' '}
            {data.run.concurrency}
          </p>
        )}
        {qualification && (
          <p className="text-sm text-warning" data-testid="experiment-point-qualification">
            {qualification}
          </p>
        )}
      </header>
      {query.isError ? (
        <RetryableQueryError
          message={t.error}
          analyticsEvent="inference_experiment_metrics_retry_clicked"
          onRetry={query.refetch}
          testId="experiment-point-query-error"
        />
      ) : query.isLoading ? (
        <EmptyState>{t.loading}</EmptyState>
      ) : data ? (
        <>
          <SegmentedToggle
            value={showConfiguration ? 'configuration' : view === 'timeline' ? 'timeline' : 'point'}
            options={[
              { value: 'point', label: t.point, testId: 'detail-view-point' },
              { value: 'timeline', label: t.timeline, testId: 'detail-view-timeline' },
              {
                value: 'configuration',
                label: t.configuration,
                testId: 'detail-view-configuration',
              },
            ]}
            onValueChange={(next) => {
              setShowConfiguration(next === 'configuration');
              if (next !== 'configuration') setView(next);
            }}
            ariaLabel={t.view}
            testId="experiment-detail-view-toggle"
          />
          {showConfiguration ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody>
                  {Object.entries(data.run.configuration).map(([key, value]) => (
                    <tr key={key} className="border-b">
                      <th scope="row" className="py-2 pr-4 font-medium">
                        {key}
                      </th>
                      <td className="break-all py-2">
                        {Array.isArray(value)
                          ? value.join(', ')
                          : value !== null && typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value ?? '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : view === 'timeline' ? (
            data.requestTimeline ? (
              <RequestTimelineView
                data={data.requestTimeline}
                pointId={`experiment:${campaign}:${runId}`}
              />
            ) : (
              <EmptyState>{t.noTimeline}</EmptyState>
            )
          ) : (
            <>
              {(hasWarmup || (metrics?.metricSources.length ?? 0) > 1) && (
                <MetricSourceToolbar
                  hasWarmup={hasWarmup}
                  phase={phase}
                  onPhaseChange={setPhase}
                  metricSources={metrics?.metricSources ?? []}
                  selectedSource={selectedSource}
                  onSourceChange={setMetricSourceId}
                  fallbackAdapter="vllm"
                />
              )}
              {effectivePhase === 'warmup' && (
                <p className="text-sm text-muted-foreground" data-testid="warmup-phase-note">
                  {t.warmup}
                </p>
              )}
              <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2">
                <SequenceMetricCard metric="isl" timeline={phaseRequests} timelineLoading={false} />
                <SequenceMetricCard metric="osl" timeline={phaseRequests} timelineLoading={false} />
                <RequestMetricOverTime
                  title={t.interactivity}
                  metric="interactivity"
                  timeline={phaseRequests}
                  isLoading={false}
                />
                <RequestMetricOverTime
                  title={t.ttft}
                  metric="ttft"
                  timeline={phaseRequests}
                  isLoading={false}
                  latencySelector
                />
                <KvCacheUtilizationCard sliced={sliced} />
                <RequestActivityCard
                  sliced={sliced}
                  phaseTimeline={phaseRequests}
                  timelineLoading={false}
                  view={activityView}
                  onViewChange={setActivityView}
                />
                <PrefixCacheHitRateCard sliced={sliced} />
                <ThroughputCard
                  sliced={sliced}
                  selectedSource={selectedSource}
                  selected={throughputSeries}
                  onSelectedChange={setThroughputSeries}
                />
                <PromptTokenSourceCard sliced={sliced} />
                <InflightUniqueTokensCard
                  phaseTimeline={phaseRequests}
                  timelineLoading={false}
                  kvCachePoolTokens={metrics?.kvCachePoolTokens ?? null}
                />
              </div>
            </>
          )}
        </>
      ) : (
        <EmptyState>{t.missing}</EmptyState>
      )}
    </div>
  );
}
