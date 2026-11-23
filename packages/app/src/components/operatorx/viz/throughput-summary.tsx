import { Roofline, SUMMARY_TITLE } from './roofline';
import type { ComparisonModel } from '../compare/model';
import type { VizDefinition } from './types';

function ThroughputSummary({ model }: { model: ComparisonModel }) {
  return <Roofline model={model} summaryOnly />;
}

export const throughputSummary: VizDefinition = {
  id: 'throughput-summary',
  title: SUMMARY_TITLE,
  ops: ['gemm', 'moe', 'attention'],
  skeletonClassName: 'h-80',
  Component: ThroughputSummary,
};
