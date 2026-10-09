/**
 * Static ubenchX TPC Skyline data: measured TPC per GPC groupings.
 *
 * Source: ubenchX/gpc_query in SemiAnalysisAI/InferenceX (ported from
 * microbench-blackwell tools/gpc_query.cu). Each run lists TPCs per GPC, sorted
 * descending, as printed by the tool; the order carries no physical GPC index.
 *
 * To add a GPU, append one entry below and paste the tool's output line into
 * `tpcsPerGpc`. The table rows, GPC/SM counts, and the /api/v1/views/ubenchx
 * `test=tpc-skyline` response are all derived from this record; nothing else
 * needs to change. Use a GPU_SPECS name as the key, matching the other tests.
 */

export interface TpcSkylineRun {
  readonly gpu: string;
  readonly driver: string;
  readonly cuda: string;
  readonly container: string;
  readonly date: string;
  readonly sourceUrl: string;
  /** TPCs per GPC, sorted descending. */
  readonly tpcsPerGpc: readonly number[];
}

const SOURCE_URL = 'https://github.com/SemiAnalysisAI/InferenceX/tree/main/ubenchX/gpc_query';
const CONTAINER = 'nvidia/cuda:13.0.3-devel-ubuntu24.04';

/** GPU keys in display order; keys match GPU_SPECS names used by the other ubenchX tests. */
export const TPC_SKYLINE_RUNS: Record<string, TpcSkylineRun> = {
  'H100 SXM': {
    gpu: 'NVIDIA H100 80GB HBM3',
    driver: '580.159.03',
    cuda: '13.0 (V13.0.88)',
    container: CONTAINER,
    date: '2026-10-09',
    sourceUrl: SOURCE_URL,
    tpcsPerGpc: [9, 9, 8, 8, 8, 8, 8, 4, 1, 1, 1, 1],
  },
  'H200 SXM': {
    gpu: 'NVIDIA H200',
    driver: '580.173.02',
    cuda: '13.0 (V13.0.88)',
    container: CONTAINER,
    date: '2026-10-09',
    sourceUrl: SOURCE_URL,
    tpcsPerGpc: [9, 9, 8, 8, 8, 8, 8, 4, 1, 1, 1, 1],
  },
  'B200 SXM': {
    gpu: 'NVIDIA B200',
    driver: '580.159.03',
    cuda: '13.0 (V13.0.88)',
    container: CONTAINER,
    date: '2026-10-09',
    sourceUrl: SOURCE_URL,
    tpcsPerGpc: [10, 10, 10, 9, 9, 9, 9, 5, 1, 1, 1],
  },
  'B300 SXM': {
    gpu: 'NVIDIA B300 SXM6 AC',
    driver: '580.159.03',
    cuda: '13.0 (V13.0.88)',
    container: CONTAINER,
    date: '2026-10-09',
    sourceUrl: SOURCE_URL,
    tpcsPerGpc: [10, 10, 10, 9, 9, 9, 9, 5, 1, 1, 1],
  },
  'GB200 NVL72': {
    gpu: 'NVIDIA GB200',
    driver: '580.126.20',
    cuda: '13.0 (V13.0.88)',
    container: CONTAINER,
    date: '2026-10-09',
    sourceUrl: SOURCE_URL,
    tpcsPerGpc: [10, 10, 10, 10, 10, 9, 9, 6, 1, 1],
  },
};
