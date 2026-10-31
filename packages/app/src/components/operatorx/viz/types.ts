import type { ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';

import type { ComparisonModel } from '../compare/model';

export interface VizDefinition {
  id: string;
  title: string;
  ops: ComparisonOp[];
  wide?: boolean;
  /** Desktop columns out of 12 when paired with another card; the partner takes the rest. */
  span?: 5 | 6 | 7;
  needsBaseline?: boolean;
  Component: (props: { model: ComparisonModel }) => React.ReactNode;
}
