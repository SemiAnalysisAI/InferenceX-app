/**
 * UI-side CollectiveX types. The neutral contract (dataset/series/coverage
 * shapes, version constants, reader) lives in the db package so the ingest
 * script and this frontend share one source of truth — see
 * `packages/db/src/collectivex/`.
 */

import type {
  CollectiveXPoint,
  CollectiveXVersion,
} from '@semianalysisai/inferencex-db/collectivex/types';

export * from '@semianalysisai/inferencex-db/collectivex/types';

export const collectiveXVersionLabel = (version: CollectiveXVersion): string => `V${version}`;

export type CollectiveXYAxis = 'latency' | 'tokens-per-second' | 'activation-rate' | 'payload-rate';

export interface CollectiveXChartPoint {
  seriesId: string;
  seriesLabel: string;
  colorKey: string;
  x: number;
  y: number;
  point: CollectiveXPoint;
}
