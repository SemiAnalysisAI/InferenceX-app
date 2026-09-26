import { distribution } from './distribution';
import { metricVsSize } from './metric-vs-size';
import { pairwiseScatter } from './pairwise-scatter';
import { roofline } from './roofline';
import { speedupVsBaseline } from './speedup-vs-baseline';
import type { VizDefinition } from './types';

/** Dashboard visualizations, in display order. */
export const VISUALIZATIONS: VizDefinition[] = [
  speedupVsBaseline,
  metricVsSize,
  roofline,
  distribution,
  pairwiseScatter,
];
