import type {
  OperatorXRawBundle,
  OperatorXRunRef,
} from '@semianalysisai/inferencex-db/operatorx/bundle';

export interface OperatorXSource {
  readonly name: string;
  listRuns: () => Promise<OperatorXRunRef[]>;
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
