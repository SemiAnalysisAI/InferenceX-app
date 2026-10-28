import type { ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';

import type { ComparisonModel } from '../compare/model';

export interface VizDefinition {
  id: string;
  title: string;
  ops: ComparisonOp[];
  wide?: boolean;
  needsBaseline?: boolean;
  Component: (props: { model: ComparisonModel }) => React.ReactNode;
}
