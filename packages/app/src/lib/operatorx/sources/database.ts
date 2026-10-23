import type { ComparisonOp } from '@semianalysisai/inferencex-db/operatorx/compare';
import { getOperatorXDb } from '@semianalysisai/inferencex-db/connection';
import type {
  OperatorXRawBundle,
  OperatorXRunRef,
} from '@semianalysisai/inferencex-db/operatorx/bundle';
import {
  getOperatorXBundle,
  getOperatorXRunComparison,
  listOperatorXRuns,
  RUN_KEY_RE,
} from '@semianalysisai/inferencex-db/queries/operatorx';

import { type OperatorXSource, OperatorXSourceError } from '../source';

export class DatabaseSource implements OperatorXSource {
  readonly name = 'database';

  listRuns(): Promise<OperatorXRunRef[]> {
    return listOperatorXRuns(getOperatorXDb());
  }

  getRunComparison(runId: string, op: ComparisonOp) {
    if (!RUN_KEY_RE.test(runId)) throw new OperatorXSourceError('Invalid run ID', 400);
    return getOperatorXRunComparison(getOperatorXDb(), runId, op);
  }

  async getBundle(runId: string): Promise<OperatorXRawBundle> {
    if (!RUN_KEY_RE.test(runId)) throw new OperatorXSourceError('Invalid run ID', 400);
    const bundle = await getOperatorXBundle(getOperatorXDb(), runId);
    if (!bundle) throw new OperatorXSourceError('Run not found', 404);
    return bundle;
  }
}
