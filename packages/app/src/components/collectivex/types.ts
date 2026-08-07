/**
 * UI-side CollectiveX types. The neutral contract (dataset/series/coverage
 * shapes, version constants, reader) lives in the db package so the ingest
 * script and this frontend share one source of truth — see
 * `packages/db/src/collectivex/`.
 */

import type {
  CollectiveXPoint,
  CollectiveXSeries,
  CollectiveXVersion,
} from '@semianalysisai/inferencex-db/collectivex/types';

// Re-exported explicitly rather than with `export *`: Next's SWC loader rejects a
// star re-export anywhere in a page's module graph ("Using `export * from '...'` in
// a page is disallowed"), and this module is reached from the /collectivex page.
export type {
  CollectiveXComponent,
  CollectiveXCoverage,
  CollectiveXCoveragePoint,
  CollectiveXDataset,
  CollectiveXKvCase,
  CollectiveXKvLatency,
  CollectiveXKvRow,
  CollectiveXMode,
  CollectiveXOperation,
  CollectiveXOutcome,
  CollectiveXPercentile,
  CollectiveXPercentiles,
  CollectiveXPhase,
  CollectiveXPoint,
  CollectiveXPrecision,
  CollectiveXRun,
  CollectiveXRunSummary,
  CollectiveXSeries,
  CollectiveXTerminalStatus,
  CollectiveXTopology,
  CollectiveXVersion,
} from '@semianalysisai/inferencex-db/collectivex/types';
export {
  COLLECTIVEX_DEFAULT_VERSION,
  COLLECTIVEX_VERSIONS,
  parseCollectiveXVersion,
} from '@semianalysisai/inferencex-db/collectivex/types';

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

/** A stored run's series with namespaced identity and selection-order visual-style index. */
export type CollectiveXRunSeries = CollectiveXSeries & {
  run_id: string;
  run_index: number;
};
