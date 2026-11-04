import { throughputSummary } from './throughput-summary';
import { metricVsSize } from './metric-vs-size';
import { roofline } from './roofline';
import { speedupVsBaseline } from './speedup-vs-baseline';
import type { VizDefinition } from './types';

export const VISUALIZATIONS: VizDefinition[] = [
  speedupVsBaseline,
  roofline,
  throughputSummary,
  metricVsSize,
];
