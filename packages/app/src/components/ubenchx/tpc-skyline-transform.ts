import type { TpcSkylineRun } from './tpc-skyline-data';

export interface TpcSkylineViewResult {
  readonly gpu: string;
  readonly tpcsPerGpc: readonly number[];
  readonly gpcCount: number;
  readonly tpcCount: number;
  readonly smCount: number;
  readonly metadata: Omit<TpcSkylineRun, 'tpcsPerGpc'>;
}

export function transformTpcSkylineRun(gpuKey: string, run: TpcSkylineRun): TpcSkylineViewResult {
  const { tpcsPerGpc, ...metadata } = run;
  const tpcCount = tpcsPerGpc.reduce((total, tpcs) => total + tpcs, 0);
  return {
    gpu: gpuKey,
    tpcsPerGpc,
    gpcCount: tpcsPerGpc.length,
    tpcCount,
    smCount: tpcCount * 2,
    metadata,
  };
}
