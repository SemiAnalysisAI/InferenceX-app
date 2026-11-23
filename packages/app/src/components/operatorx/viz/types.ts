import type { ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';

import type { Locale } from '@/lib/i18n/i18n';

import type { ComparisonModel } from '../compare/model';

export interface VizDefinition {
  id: string;
  title: Record<Locale, string>;
  ops: ComparisonOp[];
  /** Height of the placeholder shown until the chart mounts. */
  skeletonClassName: string;
  needsBaseline?: boolean;
  Component: (props: { model: ComparisonModel }) => React.ReactNode;
}
