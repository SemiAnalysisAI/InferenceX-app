import type { ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';

import type { ComparisonModel } from '../compare/model';

/** One dashboard visualization; `viz/index.ts` lists the ones the page shows. */
export interface VizDefinition {
  /** Stable id, shown on the card so it can be referred to. */
  id: string;
  title: string;
  description: string;
  ops: ComparisonOp[];
  /** Spans the full row instead of half of it. */
  wide?: boolean;
  Component: (props: { model: ComparisonModel }) => React.ReactNode;
}
