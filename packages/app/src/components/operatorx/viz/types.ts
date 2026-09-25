import type { ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';

import type { ComparisonModel } from '../compare/model';

/** One dashboard visualization; `viz/index.ts` lists the ones the page shows. */
export interface VizDefinition {
  /** Stable id, used for the card's test id. */
  id: string;
  title: string;
  ops: ComparisonOp[];
  /** Spans the full row instead of half of it. */
  wide?: boolean;
  Component: (props: { model: ComparisonModel }) => React.ReactNode;
}
