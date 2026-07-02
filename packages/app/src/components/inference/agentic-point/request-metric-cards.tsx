'use client';

import { useState } from 'react';

import type { RequestTimeline } from '@/hooks/api/use-request-timeline';
import { SegmentedToggle, type SegmentedToggleOption } from '@/components/ui/segmented-toggle';
import { track } from '@/lib/analytics';

import { CHART_SIZES, ChartEmpty, ChartSkeleton } from './chart-shared';
import { Distribution } from './distribution';
import { ExpandableChart } from './expandable-chart';
import { TimeSeriesChart } from './time-series-chart';
import {
  averageSequenceLengthInFlight,
  rollingRequestMetric,
  timeRollingAverage,
  type RequestMetric,
  type RequestPercentile,
} from './time-series-math';

const REQUEST_PERCENTILE_OPTIONS: SegmentedToggleOption<RequestPercentile>[] = [
  { value: 'p75', label: 'P75' },
  { value: 'p90', label: 'P90' },
];

const LATENCY_METRIC_OPTIONS: SegmentedToggleOption<'ttft' | 'e2e'>[] = [
  { value: 'ttft', label: 'TTFT', testId: 'latency-metric-ttft' },
  { value: 'e2e', label: 'E2E', testId: 'latency-metric-e2e' },
];

type SequenceMetricView = 'distribution' | 'inflight';

const SEQUENCE_METRIC_OPTIONS: SegmentedToggleOption<SequenceMetricView>[] = [
  { value: 'distribution', label: 'Distribution' },
  { value: 'inflight', label: 'In-flight avg' },
];

// Unofficial-run overlays cannot open this persisted point-detail route: they
// have no benchmark_results id or stored request timeline. These charts are
// therefore intentionally limited to DB-backed agentic points.
export function RequestMetricOverTime({
  title,
  metric,
  timeline,
  isLoading,
  latencySelector = false,
}: {
  title: string;
  metric: RequestMetric;
  timeline: RequestTimeline | null | undefined;
  isLoading: boolean;
  latencySelector?: boolean;
}) {
  const [percentile, setPercentile] = useState<RequestPercentile>('p90');
  const [latencyMetric, setLatencyMetric] = useState<'ttft' | 'e2e'>('ttft');
  const selectedMetric = latencySelector ? latencyMetric : metric;
  const result = timeline
    ? rollingRequestMetric(timeline.requests, selectedMetric, percentile, 50)
    : null;
  const metricLabel =
    selectedMetric === 'ttft' ? 'TTFT' : selectedMetric === 'e2e' ? 'E2E latency' : 'Interactivity';
  const color =
    selectedMetric === 'ttft' ? '#f59e0b' : selectedMetric === 'e2e' ? '#a855f7' : '#06b6d4';
  const pointCount = result?.raw.length;
  const isLatency = selectedMetric !== 'interactivity';

  const controls = (
    <div className="flex items-center gap-2">
      {latencySelector && (
        <SegmentedToggle
          value={latencyMetric}
          options={LATENCY_METRIC_OPTIONS}
          onValueChange={(value) => {
            setLatencyMetric(value);
            track('inference_agentic_latency_metric_changed', { metric: value });
          }}
          ariaLabel="Latency metric"
          testId="latency-metric-toggle"
        />
      )}
      <span
        className="text-xs tabular-nums text-muted-foreground"
        data-testid={`${selectedMetric}-point-count`}
      >
        {pointCount === undefined
          ? '— points'
          : `${pointCount.toLocaleString()} ${pointCount === 1 ? 'point' : 'points'}`}
      </span>
      <SegmentedToggle
        value={percentile}
        options={REQUEST_PERCENTILE_OPTIONS}
        onValueChange={(value) => {
          setPercentile(value);
          track('inference_agentic_percentile_changed', {
            metric: selectedMetric,
            percentile: value,
          });
        }}
        ariaLabel={`${metricLabel} percentile`}
        testId={`${selectedMetric}-percentile-toggle`}
      />
    </div>
  );

  return (
    <ExpandableChart
      title={latencySelector ? `${metricLabel} over time` : title}
      controls={controls}
      testId={`${metric}-over-time-chart`}
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (!timeline) return isLoading ? <ChartSkeleton /> : <ChartEmpty />;
        return (
          <TimeSeriesChart
            series={[
              {
                name: `${percentile.toUpperCase()} (rolling 50 req)`,
                data: result?.trend ?? [],
                rawData: result?.raw,
                color,
                strokeWidth: 2.5,
              },
              {
                name: isLatency
                  ? `Cumulative ${percentile.toUpperCase()} ${metricLabel}`
                  : `1 / cumulative ${percentile.toUpperCase()} TPOT`,
                data: result?.cumulative ?? [],
                color: '#ef4444',
                strokeWidth: 3,
              },
            ]}
            durationS={timeline.durationS}
            yFmt={
              isLatency
                ? (value) => `${value < 10 ? value.toFixed(1) : value.toFixed(0)}s`
                : (value) => `${value.toFixed(0)}`
            }
            yAxisLabel={isLatency ? `${metricLabel} (s)` : 'Interactivity (tok/s/user)'}
            {...size}
          />
        );
      }}
    />
  );
}

export function SequenceMetricCard({
  metric,
  timeline,
  timelineLoading,
}: {
  metric: 'isl' | 'osl';
  /** Phase-scoped timeline — distribution values + in-flight are both derived from it. */
  timeline: RequestTimeline | null | undefined;
  timelineLoading: boolean;
}) {
  const [view, setView] = useState<SequenceMetricView>('distribution');
  const acronym = metric.toUpperCase();
  const fullName = metric === 'isl' ? 'Input sequence length' : 'Output sequence length';
  const testPrefix = `${metric}-metric`;
  // Per-request ISL/OSL for the selected phase (request_timeline carries both,
  // so the distribution honours the warmup/profiling toggle for free).
  const values = timeline
    ? timeline.requests
        .map((r) => r[metric])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : undefined;
  return (
    <ExpandableChart
      title={view === 'distribution' ? `${fullName} distribution` : `Average ${acronym} in flight`}
      testId={`${testPrefix}-chart`}
      controls={
        <SegmentedToggle
          value={view}
          options={SEQUENCE_METRIC_OPTIONS.map((option) => ({
            ...option,
            testId: `${testPrefix}-${option.value}`,
          }))}
          onValueChange={(value) => {
            setView(value);
            track('inference_agentic_sequence_metric_view_changed', { metric, view: value });
          }}
          ariaLabel={`${acronym} chart view`}
          testId={`${testPrefix}-toggle`}
          buttonClassName="px-2 py-1 text-xs"
        />
      }
      render={(expanded) => {
        const size = expanded ? CHART_SIZES.expanded : CHART_SIZES.inline;
        if (view === 'distribution') {
          if (values && values.length > 0)
            return <Distribution values={values} unit="tokens" {...size} />;
          return timelineLoading ? <ChartSkeleton /> : <ChartEmpty />;
        }
        if (!timeline) return timelineLoading ? <ChartSkeleton /> : <ChartEmpty />;
        const raw = averageSequenceLengthInFlight(timeline.requests, metric);
        return (
          <div>
            {metric === 'osl' && (
              <p className="mb-2 text-xs text-muted-foreground">
                Retrospective: final observed OSL is assigned across each request&apos;s lifetime.
              </p>
            )}
            <TimeSeriesChart
              series={[
                {
                  name: `Average ${acronym} in flight (30s avg)`,
                  data: timeRollingAverage(raw, 30),
                  rawData: raw,
                  color: metric === 'isl' ? '#3b82f6' : '#a855f7',
                  strokeWidth: 2.5,
                },
              ]}
              durationS={timeline.durationS}
              yAxisLabel="Tokens / request"
              {...size}
            />
          </div>
        );
      }}
    />
  );
}
