'use client';

import { useMemo } from 'react';

import type { RequestChartData } from '@/hooks/api/use-request-chart-data';
import type { MetricSourceDescriptor, QueueDepthPoint } from '@/hooks/api/use-trace-server-metrics';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';

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
  rollingRatioFromComponents,
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

const SERVER_STRINGS = {
  en: {
    kvTitle: 'KV cache utilization over time',
    hbmAvg: 'Chip HBM (avg n=50)',
    avg: 'Avg',
    chipKv: 'Chip KV cache (avg n=50)',
    cpuPoolAvg: 'CPU offload pool (avg n=50)',
    kvAxis: 'KV cache (%)',
    queueOption: 'Queue depth',
    completedOption: 'Completed',
    queueTitle: 'Request queue depth',
    completedTitle: 'Cumulative completed requests',
    activityAria: 'Request activity metric',
    completedSeries: 'Completed requests',
    requestsAxis: 'Requests',
    running: 'Running (avg n=50)',
    waiting: 'Waiting (avg n=50)',
    total: 'Total (avg n=50)',
    prefixTitle: 'Prefix cache hit rate per interval',
    hbmHit: 'Chip (HBM, avg n=50)',
    hitAxis: 'Hit rate (%)',
    throughputSource: (source: string) => `Throughput · ${source}`,
    throughputTitle: 'Throughput (input & decode)',
    input: 'Input',
    decode: 'Decode',
    tokenRate: 'Tokens / sec',
    promptTitle: 'Cumulative prompt token source breakdown',
    uniqueTitle: 'Total unique input tokens over time',
    uniqueSeries: 'Cumulative unique input tokens',
    tokensAxis: 'Tokens',
    inflightTitle: 'Unique input tokens in flight',
    inflightSeries: 'In flight (avg 30s)',
    cumulativeAvg: 'Cumulative average',
    cachePool: (value: string) => `KV cache pool · ${value}`,
  },
  zh: {
    kvTitle: 'KV cache 利用率随时间变化',
    hbmAvg: '芯片 HBM（50 点均值）',
    avg: '平均值',
    chipKv: '芯片 KV cache（50 点均值）',
    cpuPoolAvg: 'CPU offload 池（50 点均值）',
    kvAxis: 'KV cache 利用率 (%)',
    queueOption: '队列深度',
    completedOption: '已完成',
    queueTitle: '请求队列深度',
    completedTitle: '累计完成请求数',
    activityAria: '请求活动指标',
    completedSeries: '已完成请求',
    requestsAxis: '请求数',
    running: '运行中（50 点均值）',
    waiting: '等待中（50 点均值）',
    total: '总数（50 点均值）',
    prefixTitle: '每个采样区间的 prefix cache 命中率',
    hbmHit: '芯片（HBM，50 点均值）',
    hitAxis: '命中率 (%)',
    throughputSource: (source: string) => `吞吐量 · ${source}`,
    throughputTitle: '吞吐量（输入与解码）',
    input: '输入',
    decode: '解码',
    tokenRate: 'token/s',
    promptTitle: '累计提示 token 的来源构成',
    uniqueTitle: '累计去重输入 token 数',
    uniqueSeries: '累计去重输入 token',
    tokensAxis: 'token 数',
    inflightTitle: '在途请求的去重输入 token 数',
    inflightSeries: '在途去重输入 token（30 秒均值）',
    cumulativeAvg: '累计均值',
    cachePool: (value: string) => `KV cache 池 · ${value}`,
  },
} as const;

const ZH_THROUGHPUT_SERIES_NAMES: Record<string, string> = {
  'Input (avg n=50)': '输入（50 点均值）',
  'Decode (avg n=50)': '解码（50 点均值）',
  'Total running avg (60s burn-in)': '总吞吐量平均值（剔除前 60 秒）',
};

/** Localize display-only series names while preserving the math helper's stable English output. */
export function localizeThroughputSeriesName(name: string, locale: Locale): string {
  return locale === 'zh' ? (ZH_THROUGHPUT_SERIES_NAMES[name] ?? name) : name;
}

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

/**
 * Bare DP ranks read as "DP 3"; disaggregated runs get role- or worker-
 * qualified labels from the ETL ("decode", "prefill 0", "0 (a01a)") that
 * already name themselves, so those pass through untouched.
 */
function engineSeriesName(engineLabel: string): string {
  return /^\d+$/u.test(engineLabel) ? `DP ${engineLabel}` : engineLabel;
}

export function KvCacheUtilizationCard({ sliced }: { sliced: SlicedServerSeries }) {
  const locale = useLocale();
  const t = SERVER_STRINGS[locale];
  return (
    <ExpandableChart
      title={t.kvTitle}
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
        const allEngines = serverSeries.kvCacheUsageByEngine ?? [];
        // Decide off the point's own engine count, not the phase-sliced one:
        // this also drives the average line's name, color and stroke, so
        // keying it to the slice would make the chart change identity when
        // you switch between the Warmup and Profiling tabs.
        const hasPerEngine = allEngines.length > 1;
        // Colors come from the unsliced position so a rank keeps its color
        // across phases; engines with no points in this phase are dropped
        // afterwards so they don't take a legend slot with no line.
        const perEngine = allEngines
          .map((e, i) => ({
            name: engineSeriesName(e.engineLabel),
            data: rollingAverage(e.points, 50),
            color: DP_RANK_PALETTE[i % DP_RANK_PALETTE.length]!,
            // Thin + translucent so the Avg line on top reads as
            // the headline number, not just one more series.
            strokeWidth: 1,
            strokeOpacity: 0.5,
          }))
          .filter((s) => s.data.length > 0);
        // Render order matters: per-engine first → average drawn on top.
        const series = [
          ...(hasPerEngine ? perEngine : []),
          {
            name: hasHost ? t.hbmAvg : hasPerEngine ? t.avg : t.chipKv,
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
                  name: t.cpuPoolAvg,
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
            yAxisLabel={t.kvAxis}
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
  timelineError,
  view,
  onViewChange,
}: {
  sliced: SlicedServerSeries;
  phaseTimeline: RequestChartData | null;
  timelineLoading: boolean;
  /** Failure message for the Completed view when the timeline query errored. */
  timelineError?: string;
  view: RequestActivityView;
  onViewChange: (view: RequestActivityView) => void;
}) {
  const locale = useLocale();
  const t = SERVER_STRINGS[locale];
  const requestActivityOptions: SegmentedToggleOption<RequestActivityView>[] = [
    { value: 'queue', label: t.queueOption, testId: 'request-activity-queue' },
    { value: 'completed', label: t.completedOption, testId: 'request-activity-completed' },
  ];
  const completedRequests = useMemo(
    () => (phaseTimeline ? cumulativeCompletedRequests(phaseTimeline.requests) : null),
    [phaseTimeline],
  );
  return (
    <ExpandableChart
      title={view === 'queue' ? t.queueTitle : t.completedTitle}
      testId="request-activity-chart"
      controls={
        <SegmentedToggle
          value={view}
          options={requestActivityOptions}
          onValueChange={(value) => {
            onViewChange(value);
            track('inference_agentic_request_activity_changed', { view: value });
          }}
          ariaLabel={t.activityAria}
          testId="request-activity-toggle"
          buttonClassName="px-2 py-1 text-xs"
        />
      }
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (view === 'completed') {
          if (!phaseTimeline) {
            if (timelineLoading) return <ChartSkeleton />;
            // A failed timeline query is not "no data" — surface the failure;
            // the page-level banner above the cards carries the retry action.
            return <ChartEmpty message={timelineError} />;
          }
          return (
            <TimeSeriesChart
              series={[
                {
                  name: t.completedSeries,
                  data: completedRequests ?? [],
                  color: '#3b82f6',
                  strokeWidth: 2.5,
                },
              ]}
              durationS={phaseTimeline.durationS}
              yAxisLabel={t.requestsAxis}
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
                name: t.running,
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
                name: t.waiting,
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
                name: t.total,
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
            yAxisLabel={t.requestsAxis}
            {...size}
          />
        );
      }}
    />
  );
}

export function PrefixCacheHitRateCard({ sliced }: { sliced: SlicedServerSeries }) {
  const locale = useLocale();
  const t = SERVER_STRINGS[locale];
  const hitRateData = useMemo(() => {
    if (!sliced) return [];
    const serverSeries = sliced.series;
    const weighted = rollingRatioFromComponents(
      serverSeries.prefixCacheHitRate,
      serverSeries.prefixCacheHitsTps,
      serverSeries.prefillTps,
      50,
    );
    // Older stored rows may not have the component rate series. Preserve
    // their existing chart rather than turning it into an empty state.
    return weighted.length > 0 ? weighted : rollingAverage(serverSeries.prefixCacheHitRate, 50);
  }, [sliced]);

  return (
    <ExpandableChart
      title={t.prefixTitle}
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (!sliced) return <ChartSkeleton />;
        return (
          <TimeSeriesChart
            series={[
              {
                name: t.hbmHit,
                data: hitRateData,
                color: '#a855f7',
                strokeWidth: 2,
              },
            ]}
            durationS={sliced.durationS}
            yMax={1}
            yFmt={(v) => `${(v * 100).toFixed(0)}%`}
            yAxisLabel={t.hitAxis}
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
  selectedSource: MetricSourceDescriptor | undefined;
  selected: ReadonlySet<ThroughputSeriesKey>;
  onSelectedChange: (next: ReadonlySet<ThroughputSeriesKey>) => void;
}) {
  const locale = useLocale();
  const t = SERVER_STRINGS[locale];
  return (
    <ExpandableChart
      title={
        selectedSource
          ? t.throughputSource(metricSourceLabel(selectedSource.source, locale))
          : t.throughputTitle
      }
      controls={
        <div className="flex items-center gap-1" data-testid="throughput-series-toggle">
          {(
            [
              ['input', t.input],
              ['decode', t.decode],
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
            ).map((series) => ({
              ...series,
              name: localizeThroughputSeriesName(series.name, locale),
            }))}
            durationS={sliced.durationS}
            yAxisLabel={t.tokenRate}
            {...size}
          />
        );
      }}
    />
  );
}

export function PromptTokenSourceCard({ sliced }: { sliced: SlicedServerSeries }) {
  const t = SERVER_STRINGS[useLocale()];
  return (
    <ExpandableChart
      title={t.promptTitle}
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
  const t = SERVER_STRINGS[useLocale()];
  return (
    <ExpandableChart
      title={t.uniqueTitle}
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
                name: t.uniqueSeries,
                data: uniqueData,
                color: '#3b82f6',
                strokeWidth: 2,
              },
            ]}
            durationS={sliced.durationS}
            yAxisLabel={t.tokensAxis}
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
  phaseTimeline: RequestChartData | null;
  timelineLoading: boolean;
  /** Nominal KV-pool capacity in tokens — drawn as a constant ceiling. */
  kvCachePoolTokens: number | null;
}) {
  const t = SERVER_STRINGS[useLocale()];
  const inflightSeries = useMemo(() => {
    if (!phaseTimeline) return null;
    const raw = inflightUniqueTokens(phaseTimeline.requests);
    return {
      raw,
      smoothed: timeRollingAverage(raw, 30),
      cumulative: cumulativeTimeAverage(raw),
    };
  }, [phaseTimeline]);
  return (
    <ExpandableChart
      title={t.inflightTitle}
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
        const raw = inflightSeries?.raw ?? [];
        const smoothed = inflightSeries?.smoothed ?? [];
        // KV-cache pool size drawn as a constant ceiling so
        // you can see how close the working set gets to eviction
        // pressure. Phase-independent — it's a static config value.
        const pool = kvCachePoolTokens;
        return (
          <TimeSeriesChart
            series={[
              {
                name: t.inflightSeries,
                data: smoothed,
                rawData: raw,
                color: '#a855f7',
                strokeWidth: 2,
              },
              {
                name: t.cumulativeAvg,
                data: inflightSeries?.cumulative ?? [],
                color: '#ef4444',
                strokeWidth: 3,
              },
            ]}
            durationS={phaseTimeline.durationS}
            yAxisLabel={t.tokensAxis}
            refLines={
              pool && pool > 0
                ? [{ value: pool, label: t.cachePool(fmtTokensCompact(pool)) }]
                : undefined
            }
            {...size}
          />
        );
      }}
    />
  );
}
