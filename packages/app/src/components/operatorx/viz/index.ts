import { comparisonTable } from './provisional/comparison-table';
import { coverage } from './provisional/coverage';
import { distribution } from './provisional/distribution';
import { kernelMatrix } from './provisional/kernel-matrix';
import { metricVsSize } from './provisional/metric-vs-size';
import { pairwiseScatter } from './provisional/pairwise-scatter';
import { precisionAdvantage } from './provisional/precision-advantage';
import { relativeHeatmap } from './provisional/relative-heatmap';
import { roofline } from './provisional/roofline';
import { sizeBuckets } from './provisional/size-buckets';
import { speedupVsBaseline } from './provisional/speedup-vs-baseline';
import { winShare } from './provisional/win-share';
import type { VizDefinition } from './types';

/** Dashboard visualizations, in display order. */
export const VISUALIZATIONS: VizDefinition[] = [
  speedupVsBaseline,
  winShare,
  metricVsSize,
  roofline,
  distribution,
  sizeBuckets,
  precisionAdvantage,
  pairwiseScatter,
  relativeHeatmap,
  kernelMatrix,
  coverage,
  comparisonTable,
];
