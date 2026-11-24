import { throughputSummary } from './ThroughputSummaryChart';
import { metricVsSize } from './MetricVsSizeChart';
import { roofline } from './RooflineChart';
import { speedupVsBaseline } from './SpeedupVsBaselineChart';
import type { VizDefinition } from './types';

export const VISUALIZATIONS: VizDefinition[] = [
  speedupVsBaseline,
  roofline,
  throughputSummary,
  metricVsSize,
];
