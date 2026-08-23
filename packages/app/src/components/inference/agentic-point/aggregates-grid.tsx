'use client';

import type { AgenticAggregateMap, MetricPercentiles } from '@/hooks/api/use-agentic-aggregates';
import type { BenchmarkSibling } from '@/hooks/api/use-benchmark-siblings';

import { AggregateChart, type AggregatePoint, type PercentileKey } from './aggregate-chart';
import { CHART_SIZES } from './chart-shared';
import { ExpandableChart } from './expandable-chart';
import { chipLabel } from './sibling-nav';
import { useLocale } from '@/lib/use-locale';

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
    values.p95 = pct.p95;
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
  const locale = useLocale();
  const t =
    locale === 'zh'
      ? {
          missing: '尚未加载同一 SKU 下的数据点。请先打开任一数据点。',
          loading: (count: number) => `正在解析 trace 数据，并汇总 ${count} 个配置……`,
          isl: '各配置的 ISL 分布',
          osl: '各配置的 OSL 分布',
          kv: '各配置的 KV cache 利用率',
          prefix: '各配置的 Prefix cache 命中率',
        }
      : {
          missing: 'SKU sibling list not loaded yet — open a point to populate.',
          loading: (count: number) =>
            `Computing aggregates across ${count} configs… (parsing trace blobs)`,
          isl: 'ISL distribution (across configs)',
          osl: 'OSL distribution (across configs)',
          kv: 'KV cache utilization (across configs)',
          prefix: 'Prefix cache hit rate (across configs)',
        };
  if (siblings.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
        {t.missing}
      </div>
    );
  }
  if (isLoading && !aggregates) {
    return (
      <div className="rounded-lg border border-border/40 bg-card/40 p-4 text-sm text-muted-foreground">
        {t.loading(siblings.length)}
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
        title={t.isl}
        render={(expanded) => (
          <AggregateChart
            points={islPoints}
            unit={locale === 'zh' ? 'token' : 'tokens'}
            {...(expanded ? CHART_SIZES.expanded : CHART_SIZES.inline)}
          />
        )}
      />
      <ExpandableChart
        title={t.osl}
        render={(expanded) => (
          <AggregateChart
            points={oslPoints}
            unit={locale === 'zh' ? 'token' : 'tokens'}
            {...(expanded ? CHART_SIZES.expanded : CHART_SIZES.inline)}
          />
        )}
      />
      <ExpandableChart
        title={t.kv}
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
        title={t.prefix}
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
