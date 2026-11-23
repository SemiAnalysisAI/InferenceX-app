'use client';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';

import { useAgenticAggregates } from '@/hooks/api/use-agentic-aggregates';
import { type RequestChartData, useRequestChartData } from '@/hooks/api/use-request-chart-data';
import { useRequestTimeline } from '@/hooks/api/use-request-timeline';
import {
  type MetricSourceDescriptor,
  useTraceServerMetrics,
  useTraceServerMetricSource,
} from '@/hooks/api/use-trace-server-metrics';
import { useBenchmarkSiblings } from '@/hooks/api/use-benchmark-siblings';
import { NudgeEngine } from '@/components/nudges/nudge-engine';
import { EmptyState } from '@/components/ui/empty-state';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { isZhPathname, ZH_PREFIX } from '@/lib/i18n/i18n';
import type { Model } from '@/lib/catalog/data-mappings';
import { inferenceModelPath, inferenceModelSlugForModel } from '@/lib/routing/inference-model-slug';
import { currentChartSearch } from '@/lib/routing/url-state';
import { resolveAgenticDetailOrigin } from '@/lib/routing/agentic-detail-origin';
import { useFeatureGate } from '@/lib/runtime/use-feature-gate';

import { AggregatesGrid } from './aggregates-grid';
import { MetricSourceToolbar } from './metric-source-toolbar';
import {
  phaseBoundarySec,
  sliceRequestChartDataByPhase,
  sliceServerSeriesByPhase,
  timelineHasWarmup,
  type PhaseSlicedSeries,
  type ServerSeriesLike,
  type StagePhase,
} from './phase-slice';
import { PointSummary } from './point-summary';
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
import { SiblingNav } from './sibling-nav';
import type { ThroughputSeriesKey } from './time-series-math';
import { useDetailView, type DetailView } from './use-detail-view';

export const AGENTIC_POINT_DETAIL_STRINGS = {
  en: {
    back: 'Back',
    inferenceChart: 'Inference chart',
    loadingSku: 'Loading SKU navigator…',
    siblingError: 'Failed to load the SKU navigator',
    loadingPoint: 'Loading point metadata…',
    configsInSku: 'configs in SKU',
    requests: 'requests',
    interactivityOverTime: 'Interactivity over Time',
    ttftOverTime: 'TTFT over Time',
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
    metricSourceError: 'The selected server-metrics source could not be loaded',
    traceFailure: 'Failed to load trace data for benchmark point #{id}',
    missingTrace:
      'No stored trace_replay blob for benchmark point #{id}. This point predates the aiperf time-series capture, or its source artifacts have expired on GitHub.',
    loadingAggregates: 'loading…',
    loadingTimeline: 'Loading request timeline…',
    missingTimeline:
      "No per-request timeline for benchmark point #{id} — the profile_export.jsonl artifact isn't stored for this row.",
    aggregatesError: 'Failed to load aggregate data across configurations',
    timelineError: 'Failed to load the request timeline',
    requestChartsError: 'Failed to load request chart data',
  },
  zh: {
    back: '返回',
    inferenceChart: '推理图表',
    loadingSku: '加载 SKU 导航器……',
    siblingError: 'SKU 导航数据加载失败',
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
    metricSourceError: '无法加载所选服务器指标来源',
    traceFailure: '无法加载基准测试数据点 #{id} 的 trace 数据',
    missingTrace:
      '基准测试数据点 #{id} 未存储 trace_replay 数据。该数据点生成于 aiperf 时间序列采集功能上线前，或 GitHub 上的源产物已过期。',
    loadingAggregates: '加载中……',
    loadingTimeline: '正在加载请求时间线……',
    missingTimeline:
      '基准测试数据点 #{id} 没有逐请求时间线；对应数据行未存储 profile_export.jsonl 产物。',
    aggregatesError: '跨配置聚合数据加载失败',
    timelineError: '请求时间线加载失败',
    requestChartsError: '请求图表数据加载失败',
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

/**
 * Whether the per-point view shows the metric-source / phase toolbar. Both inputs arrive
 * from client queries, so the page keeps a same-height slot whenever this is false (while
 * loading and after). Releasing the slot once the queries settle would shift the cards up.
 * Almost every production point has a warmup phase, so the toolbar is the usual outcome.
 */
export function showMetricSourceToolbar({
  sourceCount,
  hasWarmup,
}: {
  sourceCount: number;
  hasWarmup: boolean;
}): boolean {
  return sourceCount > 1 || hasWarmup;
}

const RequestTimelineView = dynamic(() =>
  import('./request-timeline').then((module_) => module_.RequestTimelineView),
);

const PowerTelemetryView = dynamic(() =>
  import('./power-telemetry-view').then((module_) => module_.PowerTelemetryView),
);

const ServerLogViewer = dynamic(() =>
  import('./server-log-viewer').then((module_) => module_.ServerLogViewer),
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
  const featureGateUnlocked = useFeatureGate();
  const [view, setView] = useDetailView();
  // `view` comes from the URL through useSyncExternalStore, which always renders synchronously,
  // so the toggle follows `view` while the view body renders from the deferred copy. Opening
  // Per-point mounts a dozen charts, and the press would otherwise wait for all of them.
  const renderedView = useDeferredValue(view);
  const viewOptions = useMemo(
    () => agenticDetailViewOptions(t, { featureGateUnlocked, currentView: view }),
    [t, featureGateUnlocked, view],
  );
  const metricsQuery = useTraceServerMetrics(id, true);
  const siblingsQuery = useBenchmarkSiblings(id);

  const metrics = metricsQuery.data;
  const siblingsData = siblingsQuery.data;
  // Back and the chart link open the chart of this point's own model, named in the path: the bare
  // Inference path redirects to the featured model whenever chart state leaves `g_model` out (it
  // does for the default model). The point's data names the model; until it loads (or if it
  // fails), the `g_model` the chart wrote into this page's URL does. With neither, both controls
  // wait rather than send the reader to the wrong chart.
  const [urlModel, setUrlModel] = useState<string | null>(null);
  useEffect(() => {
    setUrlModel(new URLSearchParams(window.location.search).get('g_model'));
  }, [pathname]);
  const dataModel = siblingsData?.sku.model ?? metrics?.meta.model;
  const pointModel = dataModel ? (DB_MODEL_TO_DISPLAY[dataModel] ?? dataModel) : urlModel;
  const pointModelSlug = pointModel ? inferenceModelSlugForModel(pointModel as Model) : null;
  const [inferenceHref, setInferenceHref] = useState<string | null>(null);
  useEffect(() => {
    if (!pointModelSlug) {
      setInferenceHref(null);
      return;
    }
    const chartPath = `${isZh ? ZH_PREFIX : ''}${inferenceModelPath(pointModelSlug)}`;
    const state = new URLSearchParams(currentChartSearch());
    state.delete('g_model');
    const search = state.toString();
    setInferenceHref(search ? `${chartPath}?${search}` : chartPath);
  }, [isZh, pointModelSlug]);
  // Opened from a chart in this tab: Back returns to that entry, so browser Back afterwards does
  // not reopen this page. Otherwise (deep link, new tab) Back replaces this entry with the chart.
  const [openedFromChart, setOpenedFromChart] = useState(false);
  useEffect(() => {
    setOpenedFromChart(resolveAgenticDetailOrigin(id));
  }, [id]);
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
    <div className="flex flex-col gap-4 py-6">
      <NudgeEngine scope="agentic-detail" />

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!openedFromChart && !inferenceHref}
          onClick={() => {
            track('inference_agentic_detail_back_clicked', { id });
            if (openedFromChart) router.back();
            else if (inferenceHref) router.replace(inferenceHref);
          }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft className="size-4" /> {t.back}
        </button>
        {inferenceHref && (
          <>
            <span className="text-sm text-muted-foreground">·</span>
            <IntentPrefetchLink
              href={inferenceHref}
              onClick={() => track('inference_agentic_detail_chart_link_clicked', { id })}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t.inferenceChart}
            </IntentPrefetchLink>
          </>
        )}
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
        <div className="mb-4 min-h-58 border-b border-border/40 pb-4 text-sm text-muted-foreground sm:min-h-33">
          {t.loadingSku}
        </div>
      ) : null}

      {metrics ? (
        <PointSummary meta={metrics.meta} />
      ) : metricsQuery.isLoading ? (
        <div className="mb-4 min-h-34 text-sm text-muted-foreground lg:min-h-[66px]">
          {t.loadingPoint}
        </div>
      ) : null}

      {renderedView !== 'logs' && metricsQuery.isError && (
        <RetryableQueryError
          message={withId(t.traceFailure)}
          analyticsEvent="inference_agentic_trace_retry_clicked"
          onRetry={metricsQuery.refetch}
          testId="agentic-trace-query-error"
        />
      )}
      {renderedView !== 'logs' &&
        metricsQuery.data === null &&
        !metricsQuery.isLoading &&
        !metricsQuery.isError && <EmptyState>{withId(t.missingTrace)}</EmptyState>}

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
        {renderedView === 'aggregates' && (
          <span className="text-xs text-muted-foreground">
            {siblingIds.length} {t.configsInSku}
            {aggregatesQuery.isLoading ? ` · ${t.loadingAggregates}` : ''}
          </span>
        )}
        {renderedView === 'timeline' && timelineQuery.data && (
          <span className="text-xs text-muted-foreground">
            {timelineQuery.data.requests.length} {t.requests}
          </span>
        )}
      </div>

      {renderedView === 'point' &&
        (showMetricSourceToolbar({ sourceCount: metricSources.length, hasWarmup }) ? (
          <MetricSourceToolbar
            hasWarmup={hasWarmup}
            phase={phase}
            onPhaseChange={setPhase}
            metricSources={metricSources}
            selectedSource={selectedMetricSource}
            onSourceChange={setMetricSourceId}
            fallbackAdapter={metrics?.meta.framework}
          />
        ) : (
          <div aria-hidden="true" className="h-[50px]" />
        ))}

      <div className={renderedView === 'point' ? 'contents' : 'min-h-svh'}>
        {renderedView === 'logs' ? (
          <ServerLogViewer id={id} enabled />
        ) : renderedView === 'power' ? (
          <PowerTelemetryView id={id} enabled hardware={siblingsData?.sku.hardware} />
        ) : renderedView === 'aggregates' ? (
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
        ) : renderedView === 'timeline' ? (
          timelineQuery.isLoading ? (
            <EmptyState>{t.loadingTimeline}</EmptyState>
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
            <EmptyState>{withId(t.missingTimeline)}</EmptyState>
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
                className="rounded-md border-l-2 border-warning/60 bg-warning/10 px-3 py-2 text-xs text-muted-foreground"
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
            <PointCharts
              strings={t}
              timeline={phaseRequestData}
              timelineLoading={requestChartQuery.isLoading}
              timelineFailed={requestChartQuery.isError}
              sliced={sliced}
              requestActivityView={requestActivityView}
              onRequestActivityViewChange={setRequestActivityView}
              selectedMetricSource={selectedMetricSource}
              throughputSeries={throughputSeries}
              onThroughputSeriesChange={setThroughputSeries}
              kvCachePoolTokens={metrics?.kvCachePoolTokens ?? null}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Memoized so the urgent render of a view switch, which still shows the previous view while the
// deferred one renders, skips re-rendering a dozen charts whose inputs did not change.
const PointCharts = memo(
  ({
    strings: t,
    timeline,
    timelineLoading,
    timelineFailed,
    sliced,
    requestActivityView,
    onRequestActivityViewChange,
    selectedMetricSource,
    throughputSeries,
    onThroughputSeriesChange,
    kvCachePoolTokens,
  }: {
    strings: (typeof AGENTIC_POINT_DETAIL_STRINGS)[keyof typeof AGENTIC_POINT_DETAIL_STRINGS];
    timeline: RequestChartData | null;
    timelineLoading: boolean;
    timelineFailed: boolean;
    sliced: PhaseSlicedSeries<ServerSeriesLike> | null;
    requestActivityView: RequestActivityView;
    onRequestActivityViewChange: (view: RequestActivityView) => void;
    selectedMetricSource: MetricSourceDescriptor | undefined;
    throughputSeries: ReadonlySet<ThroughputSeriesKey>;
    onThroughputSeriesChange: (next: ReadonlySet<ThroughputSeriesKey>) => void;
    kvCachePoolTokens: number | null;
  }) => (
    <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2">
      {!timelineFailed && (
        <>
          <SequenceMetricCard metric="isl" timeline={timeline} timelineLoading={timelineLoading} />
          <SequenceMetricCard metric="osl" timeline={timeline} timelineLoading={timelineLoading} />

          <RequestMetricOverTime
            title={t.interactivityOverTime}
            metric="interactivity"
            timeline={timeline}
            isLoading={timelineLoading}
          />

          <RequestMetricOverTime
            title={t.ttftOverTime}
            metric="ttft"
            timeline={timeline}
            isLoading={timelineLoading}
            latencySelector
          />
        </>
      )}

      <KvCacheUtilizationCard sliced={sliced} />

      <RequestActivityCard
        sliced={sliced}
        phaseTimeline={timeline}
        timelineLoading={timelineLoading}
        timelineError={timelineFailed ? t.requestChartsError : undefined}
        view={requestActivityView}
        onViewChange={onRequestActivityViewChange}
      />

      <PrefixCacheHitRateCard sliced={sliced} />

      <ThroughputCard
        sliced={sliced}
        selectedSource={selectedMetricSource}
        selected={throughputSeries}
        onSelectedChange={onThroughputSeriesChange}
      />

      <PromptTokenSourceCard sliced={sliced} />

      {!timelineFailed && (
        <InflightUniqueTokensCard
          phaseTimeline={timeline}
          timelineLoading={timelineLoading}
          kvCachePoolTokens={kvCachePoolTokens}
        />
      )}
    </div>
  ),
);
