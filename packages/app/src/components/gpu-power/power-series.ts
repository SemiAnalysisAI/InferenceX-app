import type { GpuPowerSeries } from '@semianalysisai/inferencex-db/power-series/power-series';

import type { GpuPowerRunInfo } from './types';

// The bucketing transform lives in the db package so ingest can precompute the
// same series the app serves from live artifacts. Named re-exports: Next.js
// rejects `export *` in client modules.

export {
  bucketPowerFiles,
  bucketPowerSeries,
  bucketTimeMs,
  meanPowerAt,
  sumPowerAt,
  type GpuPowerRole,
  type GpuPowerSeries,
} from '@semianalysisai/inferencex-db/power-series/power-series';

export interface GpuPowerSeriesResponse {
  source?: 'database' | 'github';
  runInfo: GpuPowerRunInfo;
  series: GpuPowerSeries[];
  sourceCoverage?: {
    status: 'complete' | 'incomplete' | 'unknown';
    missingSources: string[];
  };
}
