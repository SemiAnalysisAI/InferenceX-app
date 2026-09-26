/**
 * OperatorX runs from the OperatorX database, where `db:ingest:operatorx` pushes them.
 * The rows are the raw bundles, so this is a thin read.
 */
import { getOperatorXDb } from '@semianalysisai/inferencex-db/connection';
import type {
  OperatorXRawBundle,
  OperatorXRunRef,
} from '@semianalysisai/inferencex-db/operatorx/bundle';
import {
  getOperatorXBundle,
  listOperatorXRuns,
  RUN_KEY_RE,
} from '@semianalysisai/inferencex-db/queries/operatorx';

import { type OperatorXSource, OperatorXSourceError } from '../source';

export class DatabaseSource implements OperatorXSource {
  readonly name = 'database';

  listRuns(): Promise<OperatorXRunRef[]> {
    return listOperatorXRuns(getOperatorXDb());
  }

  async getBundle(runId: string): Promise<OperatorXRawBundle> {
    if (!RUN_KEY_RE.test(runId)) throw new OperatorXSourceError('Invalid run ID', 400);
    const bundle = await getOperatorXBundle(getOperatorXDb(), runId);
    if (!bundle) throw new OperatorXSourceError('Run not found', 404);
    return bundle;
  }
}
