import type {
  ReproduceLogs,
  ReproduceRun,
  ReproduceSource,
} from '@semianalysisai/inferencex-db/queries/reproduce';

import { rowToAggDataEntry } from '@/lib/benchmarks/benchmark-transform';

import { buildReproduceConfig, type ReproduceConfig } from './reproduce-config';

export type { ReproduceLogs, ReproduceRun };

/** Response body of `/api/v1/reproduce`. */
export interface ReproducePayload {
  id: number;
  config: ReproduceConfig;
  run: ReproduceRun;
  /** Null when no log bundle is stored for the result. */
  logs: ReproduceLogs | null;
}

export function buildReproducePayload(id: number, source: ReproduceSource): ReproducePayload {
  return {
    id,
    config: buildReproduceConfig(rowToAggDataEntry(source.row, { modelPower: false })),
    run: source.run,
    logs: source.logs,
  };
}
