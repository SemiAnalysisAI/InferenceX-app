import type {
  CollectiveXPoint,
  CollectiveXSeries,
  CollectiveXVersion,
} from '@semianalysisai/inferencex-db/collectivex/types';

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
  /** Set on a SKU-range median point: the band's extent and every contributing series. */
  range?: {
    lo: number;
    hi: number;
    libraries: number;
    members: { label: string; y: number }[];
  };
}

export type CollectiveXRunSeries = CollectiveXSeries & {
  run_id: string;
  run_index: number;
};
