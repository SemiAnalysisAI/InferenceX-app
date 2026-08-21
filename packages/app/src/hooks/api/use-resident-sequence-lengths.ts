import { useQuery } from '@tanstack/react-query';

import {
  mergeTokenLengthSketches,
  tokenLengthPercentiles,
  type TokenLengthSketch,
  type TokenLengthPercentiles,
} from '@semianalysisai/inferencex-constants';

interface ResidentSequenceLengthSketches {
  isl: TokenLengthSketch | null;
  osl: TokenLengthSketch | null;
  coveredPoints: number;
  requestedPoints: number;
}

export interface ResidentSequenceLengthPercentiles {
  isl: TokenLengthPercentiles;
  osl: TokenLengthPercentiles;
  coveredPoints: number;
  requestedPoints: number;
}

const MAX_IDS_PER_REQUEST = 200;
const STALE_TIME_MS = 5 * 60 * 1000;

export function chunkResidentPointIds(ids: readonly number[]): number[][] {
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += MAX_IDS_PER_REQUEST) {
    chunks.push(ids.slice(index, index + MAX_IDS_PER_REQUEST));
  }
  return chunks;
}

async function fetchResidentSequenceLengths(
  ids: number[],
  signal?: AbortSignal,
): Promise<ResidentSequenceLengthPercentiles | null> {
  const chunks = await Promise.all(
    chunkResidentPointIds(ids).map(async (chunk) => {
      const response = await fetch(`/api/v1/resident-sequence-lengths?ids=${chunk.join(',')}`, {
        signal,
      });
      if (!response.ok) throw new Error(`resident-sequence-lengths ${response.status}`);
      return (await response.json()) as ResidentSequenceLengthSketches;
    }),
  );

  const isl = tokenLengthPercentiles(mergeTokenLengthSketches(chunks.map((chunk) => chunk.isl)));
  const osl = tokenLengthPercentiles(mergeTokenLengthSketches(chunks.map((chunk) => chunk.osl)));
  if (!isl || !osl) return null;
  return {
    isl,
    osl,
    coveredPoints: chunks.reduce((sum, chunk) => sum + chunk.coveredPoints, 0),
    requestedPoints: chunks.reduce((sum, chunk) => sum + chunk.requestedPoints, 0),
  };
}

export function useResidentSequenceLengths(ids: number[], enabled = true) {
  const sortedIds = [...new Set(ids)].toSorted((a, b) => a - b);
  return useQuery({
    queryKey: ['resident-sequence-lengths', sortedIds.join(',')] as const,
    queryFn: ({ signal }) => fetchResidentSequenceLengths(sortedIds, signal),
    enabled: enabled && sortedIds.length > 0,
    staleTime: STALE_TIME_MS,
  });
}
