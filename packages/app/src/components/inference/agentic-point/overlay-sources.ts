import type { TraceServerMetrics } from '@/hooks/api/use-trace-server-metrics';

/** One server-metric series that can be drawn over the chip telemetry chart. */
export interface OverlaySource {
  key: string;
  label: { en: string; zh: string };
  unit: string;
  color: string;
  /** Seconds-from-trace-start samples, already in display units. */
  points: (metrics: TraceServerMetrics) => { t: number; value: number }[];
}

const percent = (points: readonly { t: number; value: number }[]) =>
  points.map((p) => ({ t: p.t, value: p.value * 100 }));

/**
 * Menu of overlay candidates, in display order. Only sources whose series is
 * non-empty for the point are offered (see `availableOverlaySources`).
 */
export const OVERLAY_SOURCES: readonly OverlaySource[] = [
  {
    key: 'decodeTps',
    label: { en: 'Decode throughput', zh: 'Decode 吞吐量' },
    unit: 'tok/s',
    color: '#8b5cf6',
    points: (m) => m.decodeTps,
  },
  {
    key: 'prefillTps',
    label: { en: 'Prefill throughput', zh: 'Prefill 吞吐量' },
    unit: 'tok/s',
    color: '#06b6d4',
    points: (m) => m.prefillTps,
  },
  {
    key: 'kvCacheUsage',
    label: { en: 'KV cache utilization', zh: 'KV cache 利用率' },
    unit: '%',
    color: '#f59e0b',
    points: (m) => percent(m.kvCacheUsage),
  },
  {
    key: 'hostKvCacheUsage',
    label: { en: 'Host KV cache utilization', zh: '主机 KV cache 利用率' },
    unit: '%',
    color: '#d97706',
    points: (m) => percent(m.hostKvCacheUsage),
  },
  {
    key: 'prefixCacheHitRate',
    label: { en: 'Prefix cache hit rate', zh: 'Prefix cache 命中率' },
    unit: '%',
    color: '#10b981',
    points: (m) => percent(m.prefixCacheHitRate),
  },
  {
    key: 'prefixCacheHitsTps',
    label: { en: 'Prefix cache hits', zh: 'Prefix cache 命中量' },
    unit: 'tok/s',
    color: '#14b8a6',
    points: (m) => m.prefixCacheHitsTps,
  },
  {
    key: 'queueDepth',
    label: { en: 'Queue depth (running + waiting)', zh: '队列深度（运行中 + 等待中）' },
    unit: 'req',
    color: '#ec4899',
    points: (m) => m.queueDepth.map((p) => ({ t: p.t, value: p.total })),
  },
];

/** Sources that have at least one sample for this point, in menu order. */
export function availableOverlaySources(
  metrics: TraceServerMetrics | null | undefined,
): OverlaySource[] {
  if (!metrics) return [];
  return OVERLAY_SOURCES.filter((source) => source.points(metrics).length > 0);
}
