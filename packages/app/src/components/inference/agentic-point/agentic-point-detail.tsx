'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { useAgenticAggregates } from '@/hooks/api/use-agentic-aggregates';
import { useRequestChartData } from '@/hooks/api/use-request-chart-data';
import { useRequestTimeline } from '@/hooks/api/use-request-timeline';
import {
  useTraceServerMetrics,
  useTraceServerMetricSource,
} from '@/hooks/api/use-trace-server-metrics';
import { useBenchmarkSiblings } from '@/hooks/api/use-benchmark-siblings';
import { NudgeEngine } from '@/components/nudges/nudge-engine';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { isZhPathname, ZH_PREFIX } from '@/lib/i18n/i18n';
import { withChartState } from '@/lib/routing/url-state';
import { useFeatureGate } from '@/lib/runtime/use-feature-gate';

import { AggregatesGrid } from './aggregates-grid';
import { MetricSourceToolbar } from './metric-source-toolbar';
import {
  phaseBoundarySec,
  sliceRequestChartDataByPhase,
  sliceServerSeriesByPhase,
  timelineHasWarmup,
  type ServerSeriesLike,
  type StagePhase,
} from './phase-slice';
import { PointSummary } from './point-summary';
import { PowerTelemetryView } from './power-telemetry-view';
import { RequestMetricOverTime, SequenceMetricCard } from './request-metric-cards';
import { ServerLogViewer } from './server-log-viewer';
import {
  InflightUniqueTokensCard,
  KvCacheUtilizationCard,
  PrefixCacheHitRateCard,
  PromptTokenSourceCard,
  RequestActivityCard,
  ThroughputCard,
  type RequestActivityView,
} from './server-metric-cards';
import { SiblingNav } from './sibling-nav';
import type { ThroughputSeriesKey } from './time-series-math';
import { useDetailView, type DetailView } from './use-detail-view';

export const AGENTIC_POINT_DETAIL_STRINGS = {
  en: {
    back: 'Back',
    inferenceChart: 'Inference chart',
    loadingSku: 'Loading SKU navigator…',
    siblingError: 'Failed to load the SKU navigator.',
    loadingPoint: 'Loading point metadata…',
    configsInSku: 'configs in SKU',
    requests: 'requests',
    interactivityOverTime: 'Interactivity over time',
    ttftOverTime: 'TTFT over time',
    perPoint: 'Per-point',
    requestTimeline: 'Request timeline',
    powerX: 'PowerX',
    aggregatesAcrossConfigs: 'Aggregates across configs',
    logs: 'Logs',
    detailView: 'Detail view',
    warmupWord: 'warmup',
    warmupNotePrefix: 'Showing the ',
    warmupNoteBody:
      ' phase — a cache-warming pass whose outputs are capped at 1 token. Warmup OSL ≈ 1, and interactivity/decode are blank (single-token outputs have no inter-token latency).',
    warmupNoServerData:
      ' Warmup server-side metrics aren’t available for this point, so the server charts below are empty — the request-level charts above still reflect warmup.',
    metricSourceError: 'The selected server-metrics source could not be loaded.',
    traceFailure: 'Failed to load trace data for benchmark point #{id}.',
    missingTrace:
      'No stored trace_replay blob for benchmark point #{id}. This point predates the aiperf time-series capture, or its source artifacts have expired on GitHub.',
    loadingAggregates: 'loading…',
    loadingTimeline: 'Loading request timeline…',
    missingTimeline:
      "No per-request timeline for benchmark point #{id} — the profile_export.jsonl artifact isn't stored for this row.",
    aggregatesError: 'Failed to load aggregate data across configurations.',
    timelineError: 'Failed to load the request timeline.',
    requestChartsError: 'Failed to load request chart data.',
  },
  zh: {
    back: '返回',
    inferenceChart: '推理图表',
    loadingSku: '加载 SKU 导航器……',
    siblingError: 'SKU 导航数据加载失败。',
    loadingPoint: '加载数据点元信息……',
    configsInSku: '个配置',
    requests: '个请求',
    interactivityOverTime: '交互性随时间变化',
    ttftOverTime: 'TTFT 随时间变化',
    perPoint: '单点',
    requestTimeline: '请求时间线',
    powerX: 'PowerX',
    aggregatesAcrossConfigs: '跨配置聚合',
    logs: '日志',
    detailView: '详情视图',
    warmupWord: 'warmup',
    warmupNotePrefix: '当前显示 ',
    warmupNoteBody:
      ' 阶段——该阶段用于建立 cache 状态，输出被限制为 1 个 token。warmup 阶段 OSL ≈ 1，交互性/解码指标为空（单 token 输出没有 token 间延迟）。',
    warmupNoServerData:
      ' 该数据点没有 warmup 阶段的服务器端指标，因此下方服务器图表为空——上方请求级图表仍反映 warmup 阶段数据。',
    metricSourceError: '无法加载所选服务器指标来源。',
    traceFailure: '无法加载基准测试数据点 #{id} 的 trace 数据。',
    missingTrace:
      '基准测试数据点 #{id} 未存储 trace_replay 数据。该数据点生成于 aiperf 时间序列采集功能上线前，或 GitHub 上的源产物已过期。',
    loadingAggregates: '加载中……',
    loadingTimeline: '正在加载请求时间线……',
    missingTimeline:
      '基准测试数据点 #{id} 没有逐请求时间线；对应数据行未存储 profile_export.jsonl 产物。',
    aggregatesError: '跨配置聚合数据加载失败。',
    timelineError: '请求时间线加载失败。',
    requestChartsError: '请求图表数据加载失败。',
  },
} as const;

type AgenticPointDetailStrings =
  (typeof AGENTIC_POINT_DETAIL_STRINGS)[keyof typeof AGENTIC_POINT_DETAIL_STRINGS];

/**
 * The detail views offered in the view toggle. PowerX is feature-gated: its view appears
 * once the gate is unlocked, or stays while a shared `?view=power` link has it open (the
 * same rule a locked gated dashboard tab follows).
 */
export function agenticDetailViewOptions(
  t: Pick<
    AgenticPointDetailStrings,
    'perPoint' | 'requestTimeline' | 'powerX' | 'aggregatesAcrossConfigs' | 'logs'
  >,
  { featureGateUnlocked, currentView }: { featureGateUnlocked: boolean; currentView: DetailView },
): SegmentedToggleOption<DetailView>[] {
  const showPowerView = featureGateUnlocked || currentView === 'power';
  return [
    { value: 'point', label: t.perPoint, testId: 'detail-view-point' },
    { value: 'timeline', label: t.requestTimeline, testId: 'detail-view-timeline' },
    ...(showPowerView
      ? [{ value: 'power' as const, label: t.powerX, testId: 'detail-view-power' }]
      : []),
    { value: 'aggregates', label: t.aggregatesAcrossConfigs, testId: 'detail-view-aggregates' },
    { value: 'logs', label: t.logs, testId: 'detail-view-logs' },
  ];
}

const RequestTimelineView = dynamic(() =>
  import('./request-timeline').then((module_) => module_.RequestTimelineView),
);

interface Props {
  id: number;
}

export function AgenticPointDetail({ id }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = AGENTIC_POINT_DETAIL_STRINGS[locale];
  const withId = (template: string) => template.replace('{id}', String(id));
  const isZh = isZhPathname(pathname);
  const inferenceBaseHref = isZh ? `${ZH_PREFIX}/inference` : '/inference';
  const [inferenceHref, setInferenceHref] = useState(inferenceBaseHref);
  useEffect(() => {
    setInferenceHref(withChartState(inferenceBaseHref));
  }, [inferenceBaseHref]);
  const featureGateUnlocked = useFeatureGate();
  const [view, setView] = useDetailView();
  const viewOptions = useMemo(
    () => agenticDetailViewOptions(t, { featureGateUnlocked, currentView: view }),
    [t, featureGateUnlocked, view],
  );
  const metricsQuery = useTraceServerMetrics(id, true);
  const siblingsQuery = useBenchmarkSiblings(id);

  const metrics = metricsQuery.data;
  const siblingsData = siblingsQuery.data;
  const [metricSourceId, setMetricSourceId] = useState('all');
  const [requestActivityView, setRequestActivityView] = useState<RequestActivityView>('queue');
  const [throughputSeries, setThroughputSeries] = useState<ReadonlySet<ThroughputSeriesKey>>(
    () => new Set(['input', 'decode']),
  );
  const siblingIds = siblingsData?.siblings.map((s) => s.id) ?? [];
  const aggregatesQuery = useAgenticAggregates(siblingIds, view === 'aggregates');
  const requestChartQuery = useRequestChartData(id, view === 'point');
  const requestChartData = requestChartQuery.data;
  const timelineQuery = useRequestTimeline(id, view === 'timeline');

  const [phase, setPhase] = useState<StagePhase>('profiling');
  const hasWarmup = useMemo(() => timelineHasWarmup(requestChartData), [requestChartData]);
  const effectivePhase: StagePhase = hasWarmup ? phase : 'profiling';

  const boundarySec = useMemo(
    () => phaseBoundarySec(metrics, requestChartData),
    [metrics, requestChartData],
  );
  const phaseRequestData = useMemo(
    () =>
      requestChartData ? sliceRequestChartDataByPhase(requestChartData, effectivePhase) : null,
    [requestChartData, effectivePhase],
  );

  const metricSources = metrics?.metricSources ?? [];
  const selectedMetricSource = metricSources.find(({ source }) => source.id === metricSourceId);
  const metricSourceQuery = useTraceServerMetricSource(
    id,
    metricSourceId,
    view === 'point' && metricSourceId !== 'all',
  );
  const baseServerSeries: ServerSeriesLike | undefined = useMemo(() => {
    const src = metricSourceQuery.data;
    if (src) {
      return {
        kvCacheUsage: src.kvCacheUsage,
        prefixCacheHitRate: src.prefixCacheHitRate,
        queueDepth: src.queueDepth,
        promptTokensBySource: src.promptTokensBySource,
        prefillTps: src.promptTps,
        decodeTps: src.generationTps,
        prefixCacheHitsTps: src.prefixCacheHitsTps,
        hostKvCacheUsage: src.hostKvCacheUsage,
        kvCacheUsageByEngine: src.kvCacheUsageByEngine,
      };
    }
    return metricSourceId === 'all' ? (metrics ?? undefined) : undefined;
  }, [metrics, metricSourceId, metricSourceQuery.data]);
  const sliced = useMemo(
    () =>
      baseServerSeries
        ? sliceServerSeriesByPhase(
            baseServerSeries,
            effectivePhase,
            boundarySec,
            metrics?.durationS ?? 0,
          )
        : null,
    [baseServerSeries, effectivePhase, boundarySec, metrics?.durationS],
  );
  const slicedHasServerData =
    (sliced?.series.kvCacheUsage.length ?? 0) > 1 ||
    (sliced?.series.queueDepth.length ?? 0) > 1 ||
    (sliced?.series.prefillTps.length ?? 0) > 1 ||
    (sliced?.series.prefixCacheHitRate.length ?? 0) > 1;

  return (
    <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4 py-6">
      <NudgeEngine scope="agentic-detail" />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            track('inference_agentic_detail_back_clicked', { id });
            router.back();
          }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {t.back}
        </button>
        <span className="text-sm text-muted-foreground">·</span>
        <Link
          href={inferenceHref}
          onClick={() => track('inference_agentic_detail_chart_link_clicked', { id })}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {t.inferenceChart}
        </Link>
      </div>

      {siblingsQuery.isError ? (
        <RetryableQueryError
          message={t.siblingError}
          analyticsEvent="inference_agentic_siblings_retry_clicked"
          onRetry={siblingsQuery.refetch}
          testId="agentic-siblings-query-error"
        />
      ) : siblingsData ? (
        <SiblingNav sku={siblingsData.sku} siblings={siblingsData.siblings} />
      ) : siblingsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">{t.loadingSku}</div>
      ) : null}

      {metrics ? (
        <PointSummary meta={metrics.meta} />
      ) : metricsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">{t.loadingPoint}</div>
      ) : null}

      {view !== 'logs' && metricsQuery.isError && (
        <RetryableQueryError
          message={withId(t.traceFailure)}
          analyticsEvent="inference_agentic_trace_retry_clicked"
          onRetry={metricsQuery.refetch}
          testId="agentic-trace-query-error"
        />
      )}
      {view !== 'logs' &&
        metricsQuery.data === null &&
        !metricsQuery.isLoading &&
        !metricsQuery.isError && (
          <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
            {withId(t.missingTrace)}
          </div>
        )}

      <div className="flex min-w-0 items-center justify-between gap-3">
        <SegmentedToggle
          value={view}
          options={viewOptions}
          onValueChange={setView}
          ariaLabel={t.detailView}
          testId="detail-view-toggle"
          className="max-w-full overflow-x-auto"
          buttonClassName="px-3 py-1.5 text-sm"
        />
        {view === 'aggregates' && (
          <span className="text-xs text-muted-foreground">
            {siblingIds.length} {t.configsInSku}
            {aggregatesQuery.isLoading ? ` · ${t.loadingAggregates}` : ''}
          </span>
        )}
        {view === 'timeline' && timelineQuery.data && (
          <span className="text-xs text-muted-foreground">
            {timelineQuery.data.requests.length} {t.requests}
          </span>
        )}
      </div>

      {view === 'point' && (metricSources.length > 1 || hasWarmup) && (
        <MetricSourceToolbar
          hasWarmup={hasWarmup}
          phase={phase}
          onPhaseChange={setPhase}
          metricSources={metricSources}
          selectedSource={selectedMetricSource}
          onSourceChange={setMetricSourceId}
          fallbackAdapter={metrics?.meta.framework}
        />
      )}

      {view === 'logs' ? (
        <ServerLogViewer id={id} enabled />
      ) : view === 'power' ? (
        <PowerTelemetryView id={id} enabled hardware={siblingsData?.sku.hardware} />
      ) : view === 'aggregates' ? (
        aggregatesQuery.isError ? (
          <RetryableQueryError
            message={t.aggregatesError}
            analyticsEvent="inference_agentic_aggregates_retry_clicked"
            onRetry={aggregatesQuery.refetch}
            testId="agentic-aggregates-query-error"
          />
        ) : (
          <AggregatesGrid
            siblings={siblingsData?.siblings ?? []}
            aggregates={aggregatesQuery.data}
            isLoading={aggregatesQuery.isLoading}
          />
        )
      ) : view === 'timeline' ? (
        timelineQuery.isLoading ? (
          <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
            {t.loadingTimeline}
          </div>
        ) : timelineQuery.isError ? (
          <RetryableQueryError
            message={t.timelineError}
            analyticsEvent="inference_agentic_timeline_retry_clicked"
            onRetry={timelineQuery.refetch}
            testId="agentic-timeline-query-error"
          />
        ) : timelineQuery.data ? (
          <RequestTimelineView
            data={timelineQuery.data}
            datasetSlug={siblingsQuery.data?.sku.dataset_slug}
            pointId={id}
          />
        ) : (
          <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
            {withId(t.missingTimeline)}
          </div>
        )
      ) : (
        <>
          {requestChartQuery.isError && (
            <RetryableQueryError
              message={t.requestChartsError}
              analyticsEvent="inference_agentic_request_charts_retry_clicked"
              onRetry={requestChartQuery.refetch}
              testId="agentic-request-charts-query-error"
            />
          )}
          {!requestChartQuery.isError && effectivePhase === 'warmup' && (
            <p
              className="rounded-md border-l-2 border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground"
              data-testid="warmup-phase-note"
            >
              {t.warmupNotePrefix}
              <span className="font-medium text-foreground">{t.warmupWord}</span>
              {t.warmupNoteBody}
              {!slicedHasServerData && t.warmupNoServerData}
            </p>
          )}
          {metricSourceQuery.isError && (
            <RetryableQueryError
              message={t.metricSourceError}
              analyticsEvent="inference_agentic_metric_source_retry_clicked"
              onRetry={metricSourceQuery.refetch}
              testId="agentic-metric-source-query-error"
            />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {!requestChartQuery.isError && (
              <>
                <SequenceMetricCard
                  metric="isl"
                  timeline={phaseRequestData}
                  timelineLoading={requestChartQuery.isLoading}
                />
                <SequenceMetricCard
                  metric="osl"
                  timeline={phaseRequestData}
                  timelineLoading={requestChartQuery.isLoading}
                />

                <RequestMetricOverTime
                  title={t.interactivityOverTime}
                  metric="interactivity"
                  timeline={phaseRequestData}
                  isLoading={requestChartQuery.isLoading}
                />

                <RequestMetricOverTime
                  title={t.ttftOverTime}
                  metric="ttft"
                  timeline={phaseRequestData}
                  isLoading={requestChartQuery.isLoading}
                  latencySelector
                />
              </>
            )}

            <KvCacheUtilizationCard sliced={sliced} />

            <RequestActivityCard
              sliced={sliced}
              phaseTimeline={phaseRequestData}
              timelineLoading={requestChartQuery.isLoading}
              timelineError={requestChartQuery.isError ? t.requestChartsError : undefined}
              view={requestActivityView}
              onViewChange={setRequestActivityView}
            />

            <PrefixCacheHitRateCard sliced={sliced} />

            <ThroughputCard
              sliced={sliced}
              selectedSource={selectedMetricSource}
              selected={throughputSeries}
              onSelectedChange={setThroughputSeries}
            />

            <PromptTokenSourceCard sliced={sliced} />

            {!requestChartQuery.isError && (
              <InflightUniqueTokensCard
                phaseTimeline={phaseRequestData}
                timelineLoading={requestChartQuery.isLoading}
                kvCachePoolTokens={metrics?.kvCachePoolTokens ?? null}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
