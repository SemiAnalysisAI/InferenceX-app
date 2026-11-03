import type { ComparisonCase } from '@semianalysisai/inferencex-db/operatorx/compare';

import type { Locale } from '@/lib/i18n/i18n';

import { peakBandwidthTBs, peakTflops } from './hardware';
import { rooflineBound } from './roofline-bound';

export type MetricId =
  | 'latency'
  | 'tflops'
  | 'bandwidth'
  | 'computeUtil'
  | 'bandwidthUtil'
  | 'rooflineUtil';

export interface Metric {
  id: MetricId;
  label: Record<Locale, string>;
  unit: string;
  better: 'higher' | 'lower';
  log: boolean;
  value: (c: ComparisonCase, latencyUs: number, hardware: string) => number | null;
  format: (v: number) => string;
  tick: (v: number) => string;
}

const fixed = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const plain = (v: number) => String(Number(fixed(v)));
const plainPct = (v: number) => String(Number((v * 100).toPrecision(3)));

export const METRICS: Metric[] = [
  {
    id: 'latency',
    label: { en: 'Latency', zh: '延迟' },
    unit: 'µs',
    better: 'lower',
    log: true,
    value: (_c, us) => us,
    format: (v) => `${fixed(v)} µs`,
    tick: plain,
  },
  {
    id: 'tflops',
    label: { en: 'Throughput', zh: '吞吐量' },
    unit: 'TFLOPS',
    better: 'higher',
    log: true,
    value: (c, us) => (c.flops ? c.flops / (us * 1e6) : null),
    format: (v) => `${fixed(v)} TFLOPS`,
    tick: plain,
  },
  {
    id: 'bandwidth',
    label: { en: 'Achieved bandwidth', zh: '实测带宽' },
    unit: 'TB/s',
    better: 'higher',
    log: true,
    value: (c, us) => (c.bytes ? c.bytes / (us * 1e6) : null),
    format: (v) => `${fixed(v)} TB/s`,
    tick: plain,
  },
  {
    id: 'computeUtil',
    label: { en: 'Share of peak compute', zh: '计算峰值占比' },
    unit: '%',
    better: 'higher',
    log: false,
    value: (c, us, hw) => {
      const peak = peakTflops(hw, c.computePrecision);
      return c.flops && peak ? c.flops / (us * 1e6) / peak : null;
    },
    format: pct,
    tick: plainPct,
  },
  {
    id: 'bandwidthUtil',
    label: { en: 'Share of peak bandwidth', zh: '带宽峰值占比' },
    unit: '%',
    better: 'higher',
    log: false,
    value: (c, us, hw) => {
      const peak = peakBandwidthTBs(hw);
      return c.bytes && peak ? c.bytes / (us * 1e6) / peak : null;
    },
    format: pct,
    tick: plainPct,
  },
  {
    id: 'rooflineUtil',
    label: 'Share of roofline',
    unit: '%',
    better: 'higher',
    log: false,
    value: (c, us, hw) => {
      const bound = rooflineBound(c, hw);
      return bound ? bound.us / us : null;
    },
    format: pct,
    tick: plainPct,
  },
];

const DEFAULT_METRIC: MetricId = 'tflops';

export function metricById(id: string | null): Metric {
  return METRICS.find((m) => m.id === id) ?? METRICS.find((m) => m.id === DEFAULT_METRIC)!;
}
