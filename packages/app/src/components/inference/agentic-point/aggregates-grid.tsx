'use client';

import type { AgenticAggregateMap, MetricPercentiles } from '@/hooks/api/use-agentic-aggregates';
import type { BenchmarkSibling } from '@/hooks/api/use-benchmark-siblings';

import { AggregateChart, type AggregatePoint, type PercentileKey } from './aggregate-chart';
import { CHART_SIZES } from './chart-shared';
import { ExpandableChart } from './expandable-chart';
import { chipLabel } from './sibling-nav';

/** Bundle per-percentile values for one sibling into the shape AggregateChart wants. */
function toAggPoint(
  sibling: { id: number; label: string },
  pct: MetricPercentiles | null | undefined,
): AggregatePoint {
  const values: Partial<Record<PercentileKey, number>> = {};
  if (pct) {
    values.mean = pct.mean;
    values.p50 = pct.p50;
    values.p75 = pct.p75;
    values.p90 = pct.p90;
    values.p99 = pct.p99;
  }
  return { id: sibling.id, label: sibling.label, values };
}

/** "Aggregates across configs" view: ISL/OSL/KV/prefix stats per SKU sibling. */
export function AggregatesGrid({
  siblings,
  aggregates,
  isLoading,
}: {
  siblings: BenchmarkSibling[];
  aggregates: AgenticAggregateMap | undefined;
  isLoading: boolean;
}) {
  if (siblings.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
        SKU sibling list not loaded yet — open a point to populate.
      </div>
    );
  }
  if (isLoading && !aggregates) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
        Computing aggregates across {siblings.length} configs… (parsing trace blobs)
      </div>
    );
  }
  const labeled = siblings.map((s) => ({ id: s.id, label: chipLabel(s) }));
  const islPoints = labeled.map((s) => toAggPoint(s, aggregates?.[s.id]?.isl));
  const oslPoints = labeled.map((s) => toAggPoint(s, aggregates?.[s.id]?.osl));
  const kvPoints = labeled.map((s) => toAggPoint(s, aggregates?.[s.id]?.kvCacheUtil));
  const prefixPoints = labeled.map((s) => toAggPoint(s, aggregates?.[s.id]?.prefixCacheHitRate));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ExpandableChart
        title="ISL distribution (across configs)"
        render={(expanded) => (
          <AggregateChart
            points={islPoints}
            unit="tokens"
            {...(expanded ? CHART_SIZES.expanded : CHART_SIZES.inline)}
          />
        )}
      />
      <ExpandableChart
        title="OSL distribution (across configs)"
        render={(expanded) => (
          <AggregateChart
            points={oslPoints}
            unit="tokens"
            {...(expanded ? CHART_SIZES.expanded : CHART_SIZES.inline)}
          />
        )}
      />
      <ExpandableChart
        title="KV cache utilization (across configs)"
        render={(expanded) => (
          <AggregateChart
            points={kvPoints}
            unit="%"
            yMax={1}
            yFmt={(v) => `${(v * 100).toFixed(0)}%`}
            {...(expanded ? CHART_SIZES.expanded : CHART_SIZES.inline)}
          />
        )}
      />
      <ExpandableChart
        title="Prefix cache hit rate (across configs)"
        render={(expanded) => (
          <AggregateChart
            points={prefixPoints}
            unit="%"
            yMax={1}
            yFmt={(v) => `${(v * 100).toFixed(0)}%`}
            {...(expanded ? CHART_SIZES.expanded : CHART_SIZES.inline)}
          />
        )}
      />
    </div>
  );
}
