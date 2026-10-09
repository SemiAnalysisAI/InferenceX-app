/**
 * Shared pure transform for ubenchX SM-to-SM L2 latency distance.
 *
 * Used by both the UI component and the read-only API route so they cannot
 * silently calculate different results (AGENTS.md read-only coverage rule).
 */

import type { SmL2Run, SmL2SmInfo, SmL2GpcBound } from './sm-l2-data';

export interface SmL2ViewResult {
  readonly gpu: string;
  readonly numSms: number;
  readonly dieACount: number;
  readonly orderedSms: readonly number[];
  readonly smInfo: readonly SmL2SmInfo[];
  readonly gpcBounds: readonly SmL2GpcBound[];
  /** Symmetric matrix[i][j] = mean |diff| per L2 address (cycles). */
  readonly matrix: readonly (readonly number[])[];
  readonly metadata: SmL2Run['metadata'];
  readonly stats: SmL2Stats;
}

export interface SmL2Stats {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly intraGpcMean: number;
  readonly interGpcSameDieMean: number;
  readonly crossDieMean: number;
}

/**
 * Compute summary statistics from the distance matrix.
 * This is the shared pure function for the read-only coverage rule.
 */
export function computeSmL2Stats(run: SmL2Run): SmL2Stats {
  const n = run.numSms;
  const info = run.smInfo;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  let intraSum = 0;
  let intraCount = 0;
  let interSameSum = 0;
  let interSameCount = 0;
  let crossSum = 0;
  let crossCount = 0;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const val = run.matrix[i][j];
      if (val < min) min = val;
      if (val > max) max = val;
      sum += val;
      count++;

      const gpcI = info[i].gpc;
      const gpcJ = info[j].gpc;
      const dieI = info[i].die;
      const dieJ = info[j].die;

      if (gpcI === gpcJ) {
        intraSum += val;
        intraCount++;
      } else if (dieI === dieJ) {
        interSameSum += val;
        interSameCount++;
      } else {
        crossSum += val;
        crossCount++;
      }
    }
  }

  return {
    min: count > 0 ? min : 0,
    max: count > 0 ? max : 0,
    mean: count > 0 ? sum / count : 0,
    intraGpcMean: intraCount > 0 ? intraSum / intraCount : 0,
    interGpcSameDieMean: interSameCount > 0 ? interSameSum / interSameCount : 0,
    crossDieMean: crossCount > 0 ? crossSum / crossCount : 0,
  };
}

/**
 * Transform an SM-L2 run into the view result consumed by both UI and API.
 */
export function transformSmL2Run(gpuKey: string, run: SmL2Run): SmL2ViewResult {
  return {
    gpu: gpuKey,
    numSms: run.numSms,
    dieACount: run.dieACount,
    orderedSms: run.orderedSms,
    smInfo: run.smInfo,
    gpcBounds: run.gpcBounds,
    matrix: run.matrix,
    metadata: run.metadata,
    stats: computeSmL2Stats(run),
  };
}
