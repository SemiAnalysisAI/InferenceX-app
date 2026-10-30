import { Roofline } from './roofline';
import type { ComparisonModel } from '../compare/model';
import type { VizDefinition } from './types';

function ThroughputSummary({ model }: { model: ComparisonModel }) {
  return <Roofline model={model} summaryOnly />;
}

export const throughputSummary: VizDefinition = {
  id: 'throughput-summary',
  title: 'Median and best throughput',
  ops: ['gemm', 'moe'],
  Component: ThroughputSummary,
};
