/**
 * Where OperatorX runs come from. Every source returns the same raw bundle
 * (`OperatorXRawBundle`), so the service, API and UI never know which one is active.
 *
 * Implementations: `sources/database.ts` (the OperatorX database, the default) and
 * `sources/local-directory.ts` (development).
 */
import type {
  OperatorXRawBundle,
  OperatorXRunRef,
} from '@semianalysisai/inferencex-db/operatorx/bundle';

export interface OperatorXSource {
  /** Short identifier shown in the UI and API responses (e.g. "database"). */
  readonly name: string;
  /** Runs newest first. Should be cheap: planned coverage only, no result documents. */
  listRuns: () => Promise<OperatorXRunRef[]>;
  /** The full raw bundle of one run (its newest attempt). */
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
