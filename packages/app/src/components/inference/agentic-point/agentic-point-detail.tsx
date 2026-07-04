'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { useAgenticAggregates } from '@/hooks/api/use-agentic-aggregates';
import { useRequestTimeline } from '@/hooks/api/use-request-timeline';
import { useTraceServerMetrics } from '@/hooks/api/use-trace-server-metrics';
import { useBenchmarkSiblings } from '@/hooks/api/use-benchmark-siblings';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics';

import { AggregatesGrid } from './aggregates-grid';
import { MetricSourceToolbar } from './metric-source-toolbar';
import {
  phaseBoundarySec,
  sliceServerSeriesByPhase,
  sliceTimelineByPhase,
  timelineHasWarmup,
  type ServerSeriesLike,
  type StagePhase,
} from './phase-slice';
import { PointSummary } from './point-summary';
import { RequestMetricOverTime, SequenceMetricCard } from './request-metric-cards';
import { RequestTimelineView } from './request-timeline';
import {
  CumulativeUniqueInputTokensCard,
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

interface Props {
  id: number;
}

type DetailView = 'point' | 'timeline' | 'aggregates';

const VIEW_OPTIONS: SegmentedToggleOption<DetailView>[] = [
  { value: 'point', label: 'Per-point', testId: 'detail-view-point' },
  { value: 'timeline', label: 'Request timeline', testId: 'detail-view-timeline' },
  { value: 'aggregates', label: 'Aggregates across configs', testId: 'detail-view-aggregates' },
];

const isDetailView = (value: string | null): value is DetailView =>
  value === 'point' || value === 'timeline' || value === 'aggregates';

/** URL-persisted detail view (`?view=`; per-point is the unadorned default). */
function useDetailView(): [DetailView, (nextView: DetailView) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get('view');
  const view: DetailView = isDetailView(requestedView) ? requestedView : 'point';
  const setView = useCallback(
    (nextView: DetailView) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (nextView === 'point') nextParams.delete('view');
      else nextParams.set('view', nextView);
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      track('inference_agentic_detail_view_changed', { view: nextView });
    },
    [pathname, router, searchParams],
  );
  return [view, setView];
}

export function AgenticPointDetail({ id }: Props) {
  const router = useRouter();
  const metricsQuery = useTraceServerMetrics(id, true);
  const siblingsQuery = useBenchmarkSiblings(id);

  const metrics = metricsQuery.data;
  const siblingsData = siblingsQuery.data;

  const [view, setView] = useDetailView();
  const [metricSourceId, setMetricSourceId] = useState('all');
  const [requestActivityView, setRequestActivityView] = useState<RequestActivityView>('queue');
  const [throughputSeries, setThroughputSeries] = useState<ReadonlySet<ThroughputSeriesKey>>(
    () => new Set(['input', 'decode']),
  );
  // Fetch aggregates only when the aggregates view is active. Uses the full
  // sibling set (across parallelism + concurrency configs) so each chart
  // shows how the metric varies across the SKU.
  const siblingIds = siblingsData?.siblings.map((s) => s.id) ?? [];
  const aggregatesQuery = useAgenticAggregates(siblingIds, view === 'aggregates');
  // Per-request timeline used by the timeline view AND every per-point
  // request-derived chart (ISL/OSL, latency-over-time, in-flight), so fetch
  // whenever we're on either view.
  const timelineQuery = useRequestTimeline(id, view === 'timeline' || view === 'point');
  const timeline = timelineQuery.data;

  // Warmup vs profiling stage. Only meaningful when the point actually has a
  // warmup phase (older runs are profiling-only) — when absent the toggle is
  // hidden and everything falls back to the full (profiling) run.
  const [phase, setPhase] = useState<StagePhase>('profiling');
  const hasWarmup = useMemo(() => timelineHasWarmup(timeline), [timeline]);
  const effectivePhase: StagePhase = hasWarmup ? phase : 'profiling';

  // Server-metric boundary on the chart's own t-axis (rebased through absolute
  // ns — see phase-slice header for the origin-gap invariant). Request charts
  // get a phase-scoped timeline (filtered + rebased) so they share a 0-based
  // axis with the server charts for the selected phase.
  const boundarySec = useMemo(() => phaseBoundarySec(metrics, timeline), [metrics, timeline]);
  const phaseTimeline = useMemo(
    () => (timeline ? sliceTimelineByPhase(timeline, effectivePhase) : null),
    [timeline, effectivePhase],
  );

  const metricSources = metrics?.metricSources ?? [];
  const selectedMetricSource = metricSources.find(({ source }) => source.id === metricSourceId);
  const baseServerSeries: ServerSeriesLike | undefined = useMemo(() => {
    const src = metrics?.metricSources?.find((m) => m.source.id === metricSourceId);
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
    return metrics ?? undefined;
  }, [metrics, metricSourceId]);
  // Phase-sliced server series (+ matching durationS) consumed by every server
  // chart. Null only when there are no server metrics at all.
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
  // Some runs only scrape server metrics during profiling — `chart_series`
  // starts at the profiling boundary, so the warmup slice collapses to ~0–1
  // points (just the t=0 origin) even though request-level warmup data exists.
  // Require ≥2 points in some series to count as real warmup coverage; otherwise
  // show an explanatory note instead of six silently-blank charts.
  const slicedHasServerData =
    (sliced?.series.kvCacheUsage.length ?? 0) > 1 ||
    (sliced?.series.queueDepth.length ?? 0) > 1 ||
    (sliced?.series.prefillTps.length ?? 0) > 1 ||
    (sliced?.series.prefixCacheHitRate.length ?? 0) > 1;

  return (
    <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4 py-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        <span className="text-sm text-muted-foreground">·</span>
        <Link href="/inference" className="text-sm text-muted-foreground hover:text-foreground">
          Inference chart
        </Link>
      </div>

      {siblingsData ? (
        <SiblingNav sku={siblingsData.sku} siblings={siblingsData.siblings} />
      ) : siblingsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading SKU navigator…</div>
      ) : null}

      {metrics ? (
        <PointSummary meta={metrics.meta} />
      ) : metricsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading point metadata…</div>
      ) : null}

      {metricsQuery.isError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load trace data for benchmark point #{id}.
        </div>
      )}
      {metricsQuery.data === null && !metricsQuery.isLoading && (
        <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
          No stored trace_replay blob for benchmark point #{id}. This point predates the aiperf
          time-series capture, or its source artifacts have expired on GitHub.
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <SegmentedToggle
          value={view}
          options={VIEW_OPTIONS}
          onValueChange={setView}
          ariaLabel="Detail view"
          testId="detail-view-toggle"
          buttonClassName="px-3 py-1.5 text-sm"
        />
        {view === 'aggregates' && (
          <span className="text-xs text-muted-foreground">
            {siblingIds.length} configs in SKU
            {aggregatesQuery.isLoading ? ' · loading…' : ''}
          </span>
        )}
        {view === 'timeline' && timelineQuery.data && (
          <span className="text-xs text-muted-foreground">
            {timelineQuery.data.requests.length} requests
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

      {view === 'aggregates' ? (
        <AggregatesGrid
          siblings={siblingsData?.siblings ?? []}
          aggregates={aggregatesQuery.data}
          isLoading={aggregatesQuery.isLoading}
        />
      ) : view === 'timeline' ? (
        timelineQuery.isLoading ? (
          <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
            Loading request timeline…
          </div>
        ) : timelineQuery.data ? (
          <RequestTimelineView
            data={timelineQuery.data}
            datasetSlug={siblingsQuery.data?.sku.dataset_slug}
            pointId={id}
          />
        ) : (
          <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
            No per-request timeline for benchmark point #{id} — the profile_export.jsonl artifact
            isn&apos;t stored for this row.
          </div>
        )
      ) : (
        <>
          {effectivePhase === 'warmup' && (
            <p
              className="rounded-md border-l-2 border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground"
              data-testid="warmup-phase-note"
            >
              Showing the <span className="font-medium text-foreground">warmup</span> phase — a
              cache-warming pass whose outputs are capped at 1 token. Warmup OSL ≈ 1, and
              interactivity/decode are blank (single-token outputs have no inter-token latency).
              {!slicedHasServerData &&
                ' Warmup server-side metrics aren’t available for this point, so the server charts below are empty — the request-level charts above still reflect warmup.'}
            </p>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SequenceMetricCard
              metric="isl"
              timeline={phaseTimeline}
              timelineLoading={timelineQuery.isLoading}
            />
            <SequenceMetricCard
              metric="osl"
              timeline={phaseTimeline}
              timelineLoading={timelineQuery.isLoading}
            />

            <RequestMetricOverTime
              title="Interactivity over time"
              metric="interactivity"
              timeline={phaseTimeline}
              isLoading={timelineQuery.isLoading}
            />

            <RequestMetricOverTime
              title="TTFT over time"
              metric="ttft"
              timeline={phaseTimeline}
              isLoading={timelineQuery.isLoading}
              latencySelector
            />

            <KvCacheUtilizationCard sliced={sliced} />

            <RequestActivityCard
              sliced={sliced}
              phaseTimeline={phaseTimeline}
              timelineLoading={timelineQuery.isLoading}
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

            <CumulativeUniqueInputTokensCard sliced={sliced} />

            <InflightUniqueTokensCard
              phaseTimeline={phaseTimeline}
              timelineLoading={timelineQuery.isLoading}
              kvCachePoolTokens={metrics?.kvCachePoolTokens ?? null}
            />
          </div>
        </>
      )}
    </div>
  );
}
