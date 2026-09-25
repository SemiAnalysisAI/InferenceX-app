import type { ComparisonCase } from '@semianalysisai/inferencex-db/operatorx/compare';

import { peakBandwidthTBs, peakTflops } from './hardware';

export type MetricId = 'latency' | 'tflops' | 'bandwidth' | 'computeUtil' | 'bandwidthUtil';

export interface Metric {
  id: MetricId;
  label: string;
  unit: string;
  better: 'higher' | 'lower';
  /** Values span decades; charts default to a log scale. */
  log: boolean;
  value: (c: ComparisonCase, latencyUs: number, hardware: string) => number | null;
  format: (v: number) => string;
}

const fixed = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

export const METRICS: Metric[] = [
  {
    id: 'latency',
    label: 'Latency',
    unit: 'µs',
    better: 'lower',
    log: true,
    value: (_c, us) => us,
    format: (v) => `${fixed(v)} µs`,
  },
  {
    id: 'tflops',
    label: 'Throughput',
    unit: 'TFLOPS',
    better: 'higher',
    log: true,
    value: (c, us) => (c.flops ? c.flops / (us * 1e6) : null),
    format: (v) => `${fixed(v)} TFLOPS`,
  },
  {
    id: 'bandwidth',
    label: 'Achieved bandwidth',
    unit: 'TB/s',
    better: 'higher',
    log: true,
    value: (c, us) => (c.bytes ? c.bytes / (us * 1e6) : null),
    format: (v) => `${fixed(v)} TB/s`,
  },
  {
    id: 'computeUtil',
    label: '% of peak compute',
    unit: '%',
    better: 'higher',
    log: false,
    value: (c, us, hw) => {
      const peak = peakTflops(hw, c.computePrecision);
      return c.flops && peak ? c.flops / (us * 1e6) / peak : null;
    },
    format: pct,
  },
  {
    id: 'bandwidthUtil',
    label: '% of peak bandwidth',
    unit: '%',
    better: 'higher',
    log: false,
    value: (c, us, hw) => {
      const peak = peakBandwidthTBs(hw);
      return c.bytes && peak ? c.bytes / (us * 1e6) / peak : null;
    },
    format: pct,
  },
];

export function metricById(id: string | null): Metric {
  return METRICS.find((m) => m.id === id) ?? METRICS[0];
}
