'use client';

import type { RequestTimeline } from '@/hooks/api/use-request-timeline';
import type { MetricSourceSeries, QueueDepthPoint } from '@/hooks/api/use-trace-server-metrics';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics';

import { CHART_SIZES, ChartEmpty, ChartSkeleton } from './chart-shared';
import { ExpandableChart } from './expandable-chart';
import { metricSourceLabel } from './metric-source-toolbar';
import type { PhaseSlicedSeries, ServerSeriesLike } from './phase-slice';
import { StackedAreaChart, TimeSeriesChart } from './time-series-chart';
import {
  cumulativeCompletedRequests,
  cumulativeDifferenceMonotonic,
  cumulativeTimeAverage,
  cumulativeUniqueInputTokens,
  buildThroughputChartSeries,
  inflightUniqueTokens,
  rollingAverage,
  timeRollingAverage,
  toggleThroughputSeries,
  type ThroughputSeriesKey,
} from './time-series-math';

/**
 * Phase-sliced server series (+ matching durationS). Null while the trace
 * blob is loading or absent — cards render a skeleton until it arrives.
 */
type SlicedServerSeries = PhaseSlicedSeries<ServerSeriesLike> | null;

export type RequestActivityView = 'queue' | 'completed';

const REQUEST_ACTIVITY_OPTIONS: SegmentedToggleOption<RequestActivityView>[] = [
  { value: 'queue', label: 'Queue depth', testId: 'request-activity-queue' },
  { value: 'completed', label: 'Completed', testId: 'request-activity-completed' },
];

/** Compact token count for chart labels: 306808 → "307K tok", 3.2e6 → "3.2M tok". */
const fmtTokensCompact = (n: number): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M tok`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K tok`;
  return `${Math.round(n)} tok`;
};

// Per-DP-rank color palette for DEP runs (one distinct color per rank in
// the KV cache utilization overlay). Mirrors the request-timeline row
// palette so the same DP index reads as the same color across both views.
// Wraps mod-N if more than 12 ranks ever land.
const DP_RANK_PALETTE = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#f97316',
  '#84cc16',
  '#ec4899',
  '#14b8a6',
  '#8b5cf6',
  '#eab308',
];

export function KvCacheUtilizationCard({ sliced }: { sliced: SlicedServerSeries }) {
  return (
    <ExpandableChart
      title="KV cache utilization over time"
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (!sliced) return <ChartSkeleton />;
        const serverSeries = sliced.series;
        // For SGLang hicache rows we have both GPU (HBM) util and
        // host (CPU offload pool) util — overlay them as two lines.
        const hasHost = serverSeries.hostKvCacheUsage.length > 0;
        // DEP runs report one series per engine. When there's more
        // than one, draw one line per rank in distinct colors so
        // load skew is visible at a glance; cluster-average sits on
        // top in white so it stands out.
        const perEngine = serverSeries.kvCacheUsageByEngine ?? [];
        const hasPerEngine = perEngine.length > 1;
        // Render order matters: per-engine first → average drawn on top.
        const series = [
          ...(hasPerEngine
            ? perEngine.map((e, i) => ({
                name: `DP ${e.engineLabel}`,
                data: rollingAverage(e.points, 50),
                color: DP_RANK_PALETTE[i % DP_RANK_PALETTE.length]!,
                // Thin + translucent so the Avg line on top reads as
                // the headline number, not just one more series.
                strokeWidth: 1,
                strokeOpacity: 0.5,
              }))
            : []),
          {
            name: hasHost ? 'GPU HBM (avg n=50)' : hasPerEngine ? 'Avg' : 'GPU KV cache (avg n=50)',
            data: rollingAverage(serverSeries.kvCacheUsage, 50),
            // Skip raw scatter when per-engine overlay is on — the
            // DP-rank lines already convey the spread, dots would be noise.
            rawData: hasPerEngine ? undefined : serverSeries.kvCacheUsage,
            // Bold red Avg sits on top of the translucent per-DP lines.
            // DP 1 in the palette is #ef4444 (lighter red); the darker
            // #dc2626 here plus the heavier stroke keeps it distinct.
            color: hasPerEngine ? '#dc2626' : '#3b82f6',
            strokeWidth: hasPerEngine ? 3.5 : 2,
          },
          ...(hasHost
            ? [
                {
                  name: 'CPU offload pool (avg n=50)',
                  data: rollingAverage(serverSeries.hostKvCacheUsage, 50),
                  rawData: serverSeries.hostKvCacheUsage,
                  color: '#f97316',
                  strokeWidth: 2,
                },
              ]
            : []),
        ];
        return (
          <TimeSeriesChart
            series={series}
            durationS={sliced.durationS}
            yMax={1}
            yFmt={(v) => `${(v * 100).toFixed(0)}%`}
            yAxisLabel="KV cache (%)"
            {...size}
          />
        );
      }}
    />
  );
}

export function RequestActivityCard({
  sliced,
  phaseTimeline,
  timelineLoading,
  view,
  onViewChange,
}: {
  sliced: SlicedServerSeries;
  phaseTimeline: RequestTimeline | null;
  timelineLoading: boolean;
  view: RequestActivityView;
  onViewChange: (view: RequestActivityView) => void;
}) {
  return (
    <ExpandableChart
      title={view === 'queue' ? 'Request queue depth' : 'Cumulative completed requests'}
      testId="request-activity-chart"
      controls={
        <SegmentedToggle
          value={view}
          options={REQUEST_ACTIVITY_OPTIONS}
          onValueChange={(value) => {
            onViewChange(value);
            track('inference_agentic_request_activity_changed', { view: value });
          }}
          ariaLabel="Request activity metric"
          testId="request-activity-toggle"
          buttonClassName="px-2 py-1 text-xs"
        />
      }
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (view === 'completed') {
          if (!phaseTimeline) {
            return timelineLoading ? <ChartSkeleton /> : <ChartEmpty />;
          }
          return (
            <TimeSeriesChart
              series={[
                {
                  name: 'Completed requests',
                  data: cumulativeCompletedRequests(phaseTimeline.requests),
                  color: '#3b82f6',
                  strokeWidth: 2.5,
                },
              ]}
              durationS={phaseTimeline.durationS}
              yAxisLabel="Requests"
              {...size}
            />
          );
        }
        if (!sliced) return <ChartSkeleton />;
        const serverSeries = sliced.series;
        return (
          <TimeSeriesChart
            series={[
              {
                name: 'Running (avg n=50)',
                data: rollingAverage(
                  serverSeries.queueDepth.map((p: QueueDepthPoint) => ({
                    t: p.t,
                    value: p.running,
                  })),
                  50,
                ),
                color: '#22c55e',
                strokeWidth: 2,
              },
              {
                name: 'Waiting (avg n=50)',
                data: rollingAverage(
                  serverSeries.queueDepth.map((p: QueueDepthPoint) => ({
                    t: p.t,
                    value: p.waiting,
                  })),
                  50,
                ),
                color: '#ef4444',
                strokeWidth: 2,
              },
              {
                name: 'Total (avg n=50)',
                data: rollingAverage(
                  serverSeries.queueDepth.map((p: QueueDepthPoint) => ({
                    t: p.t,
                    value: p.total,
                  })),
                  50,
                ),
                color: '#3b82f6',
                strokeWidth: 2,
              },
            ]}
            durationS={sliced.durationS}
            yAxisLabel="Requests"
            {...size}
          />
        );
      }}
    />
  );
}

export function PrefixCacheHitRateCard({ sliced }: { sliced: SlicedServerSeries }) {
  return (
    <ExpandableChart
      title="Prefix cache hit rate per interval"
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (!sliced) return <ChartSkeleton />;
        const serverSeries = sliced.series;
        return (
          <TimeSeriesChart
            series={[
              {
                name: 'GPU (HBM, avg n=50)',
                data: rollingAverage(serverSeries.prefixCacheHitRate, 50),
                rawData: serverSeries.prefixCacheHitRate,
                color: '#a855f7',
                strokeWidth: 2,
              },
            ]}
            durationS={sliced.durationS}
            yMax={1}
            yFmt={(v) => `${(v * 100).toFixed(0)}%`}
            yAxisLabel="Hit rate (%)"
            {...size}
          />
        );
      }}
    />
  );
}

export function ThroughputCard({
  sliced,
  selectedSource,
  selected,
  onSelectedChange,
}: {
  sliced: SlicedServerSeries;
  selectedSource: MetricSourceSeries | undefined;
  selected: ReadonlySet<ThroughputSeriesKey>;
  onSelectedChange: (next: ReadonlySet<ThroughputSeriesKey>) => void;
}) {
  return (
    <ExpandableChart
      title={
        selectedSource
          ? `Throughput · ${metricSourceLabel(selectedSource.source)}`
          : 'Throughput (input & decode)'
      }
      controls={
        <div className="flex items-center gap-1" data-testid="throughput-series-toggle">
          {(
            [
              ['input', 'Input'],
              ['decode', 'Decode'],
            ] as const
          ).map(([key, label]) => {
            const active = selected.has(key);
            const isOnlyActive = active && selected.size === 1;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                disabled={isOnlyActive}
                data-testid={`throughput-series-${key}`}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  active
                    ? key === 'input'
                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-300'
                      : 'bg-orange-500/20 text-orange-600 dark:text-orange-300'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                } disabled:cursor-not-allowed disabled:opacity-60`}
                onClick={() => {
                  const next = toggleThroughputSeries(selected, key);
                  if (next === selected) return;
                  onSelectedChange(next);
                  track('inference_agentic_throughput_series_toggled', {
                    series: key,
                    enabled: next.has(key),
                  });
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      }
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (!sliced) return <ChartSkeleton />;
        const serverSeries = sliced.series;
        return (
          <TimeSeriesChart
            series={buildThroughputChartSeries(
              serverSeries.prefillTps,
              serverSeries.decodeTps,
              selected,
            )}
            durationS={sliced.durationS}
            yAxisLabel="Tokens / sec"
            {...size}
          />
        );
      }}
    />
  );
}

export function PromptTokenSourceCard({ sliced }: { sliced: SlicedServerSeries }) {
  return (
    <ExpandableChart
      title="Cumulative prompt token source breakdown"
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (!sliced) return <ChartSkeleton />;
        return (
          <StackedAreaChart
            sourceSeries={sliced.series.promptTokensBySource}
            durationS={sliced.durationS}
            {...size}
          />
        );
      }}
    />
  );
}

export function CumulativeUniqueInputTokensCard({ sliced }: { sliced: SlicedServerSeries }) {
  return (
    <ExpandableChart
      title="Total unique input tokens over time"
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (!sliced) return <ChartSkeleton />;
        const serverSeries = sliced.series;
        // Unique = total prompt tokens received minus tokens served from
        // any cache tier — i.e. the freshly prefill-computed tokens. Prefer
        // the promptTokensBySource breakdown (its buckets sum to the real
        // prompt-token total, so subtracting cache tiers is exact). Fall
        // back to cumsum(prefillTps - prefixCacheHitsTps) only for older
        // data without the breakdown: vllm:prefix_cache_hits re-counts
        // tokens across scheduler passes, so its cumulative can exceed the
        // prompt tokens received, driving the diff negative and freezing
        // the monotonic-clamped line after a few seconds.
        const uniqueFromBreakdown = cumulativeUniqueInputTokens(serverSeries.promptTokensBySource);
        const uniqueData =
          uniqueFromBreakdown.length > 0
            ? uniqueFromBreakdown
            : cumulativeDifferenceMonotonic(
                serverSeries.prefillTps,
                serverSeries.prefixCacheHitsTps,
              );
        return (
          <TimeSeriesChart
            series={[
              {
                name: 'Cumulative unique input tokens',
                data: uniqueData,
                color: '#3b82f6',
                strokeWidth: 2,
              },
            ]}
            durationS={sliced.durationS}
            yAxisLabel="Tokens"
            {...size}
          />
        );
      }}
    />
  );
}

export function InflightUniqueTokensCard({
  phaseTimeline,
  timelineLoading,
  kvCachePoolTokens,
}: {
  phaseTimeline: RequestTimeline | null;
  timelineLoading: boolean;
  /** KV-cache pool size in tokens (vLLM only) — drawn as a constant ceiling. */
  kvCachePoolTokens: number | null;
}) {
  return (
    <ExpandableChart
      title="Unique input tokens in flight"
      testId="unique-input-inflight-chart"
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (!phaseTimeline) {
          return timelineLoading ? <ChartSkeleton /> : <ChartEmpty />;
        }
        // Step function: at each request start/end, sum the ISLs of
        // currently-active requests across distinct cids. Within one
        // cid turns are sequential so each cid contributes at most
        // one in-flight ISL; across cids we treat content as
        // independent (cross-conv prefix sharing adds <1pp in
        // practice). Smooth with a 30s time-weighted rolling average
        // so brief turn-handoff dips don't dominate the chart.
        const raw = inflightUniqueTokens(phaseTimeline.requests);
        const smoothed = timeRollingAverage(raw, 30);
        // KV-cache pool size (vLLM only) drawn as a constant ceiling so
        // you can see how close the working set gets to eviction
        // pressure. Phase-independent — it's a static config value.
        const pool = kvCachePoolTokens;
        return (
          <TimeSeriesChart
            series={[
              {
                name: 'In flight (avg 30s)',
                data: smoothed,
                rawData: raw,
                color: '#a855f7',
                strokeWidth: 2,
              },
              {
                name: 'Cumulative average',
                data: cumulativeTimeAverage(raw),
                color: '#ef4444',
                strokeWidth: 3,
              },
            ]}
            durationS={phaseTimeline.durationS}
            yAxisLabel="Tokens"
            refLines={
              pool && pool > 0
                ? [{ value: pool, label: `KV cache pool · ${fmtTokensCompact(pool)}` }]
                : undefined
            }
            {...size}
          />
        );
      }}
    />
  );
}
