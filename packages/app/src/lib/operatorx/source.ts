import type { Comparison, ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';
import type {
  OperatorXRawBundle,
  OperatorXRunRef,
} from '@semianalysisai/inferencex-db/operatorx/bundle';

export interface OperatorXSource {
  readonly name: string;
  listRuns: () => Promise<OperatorXRunRef[]>;
  /** Compact ingest-time comparison, or null for an unbackfilled run. */
  getRunComparison?: (runId: string, op: ComparisonOp) => Promise<Comparison | null>;
  /** Bulk compact reads preserve the captured revisions; omitted runs use raw fallback. */
  getRunComparisons?: (
    runs: OperatorXRunRef[],
    op: ComparisonOp,
  ) => Promise<Map<string, Comparison>>;
  getBundle: (runId: string) => Promise<OperatorXRawBundle>;
}

export class OperatorXSourceError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'OperatorXSourceError';
    this.status = status;
  }
}
