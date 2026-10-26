import { SM_L2_RUNS } from '@/components/ubenchx/sm-l2-data';
import { transformSmL2Run } from '@/components/ubenchx/sm-l2-transform';
import { TPC_SKYLINE_RUNS } from '@/components/ubenchx/tpc-skyline-data';
import { transformTpcSkylineRun } from '@/components/ubenchx/tpc-skyline-transform';
import { UBENCHX_GPU_KEYS, UBENCHX_RUNS } from '@/components/ubenchx/ubenchx-data';
import { transformUbenchxRun } from '@/components/ubenchx/ubenchx-transform';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/cache/api-cache', () => ({
  cachedJson: (data: unknown) => Response.json(data),
  cachedQuery: (fn: unknown) => fn,
}));

const request = (params: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/v1/views/ubenchx?${new URLSearchParams(params)}`);

describe('ubenchx view', () => {
  it('returns all tests when no test selector is provided', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.view).toBe('ubenchx');
    expect(body.apiVersion).toBe('v1');
    expect(body.test).toBe('all');
    expect(body.tests).toEqual(['mem-bw', 'sm-l2-distance', 'tpc-skyline', 'core-memory-profiles']);
    expect(body.memBw.gpus).toHaveLength(1);
    expect(body.smL2Distance.gpus.length).toBeGreaterThanOrEqual(1);
    expect(body.tpcSkyline.gpus).toHaveLength(Object.keys(TPC_SKYLINE_RUNS).length);
  });

  it('returns only mem-bw data when test=mem-bw', async () => {
    const response = await GET(request({ test: 'mem-bw' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.test).toBe('mem-bw');
    expect(body.params.test).toBe('mem-bw');
    expect(body.gpus).toHaveLength(1);
    expect(body.gpus[0].gpu).toBe('H100 SXM');
    expect(body.gpus[0].rows.length).toBe(32);
  });

  it('returns all mem-bw GPUs when test=mem-bw&gpu=all', async () => {
    const response = await GET(request({ test: 'mem-bw', gpu: 'all' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.params.gpu).toBe('all');
    expect(body.gpus).toHaveLength(Object.keys(UBENCHX_RUNS).length);
  });

  it('returns a specific GPU by name for mem-bw', async () => {
    const response = await GET(request({ test: 'mem-bw', gpu: 'B300 SXM' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.params.gpu).toBe('B300 SXM');
    expect(body.gpus).toHaveLength(1);
    expect(body.gpus[0].gpu).toBe('B300 SXM');
    expect(body.gpus[0].rows.length).toBe(32);
  });

  it('returns sm-l2-distance data when test=sm-l2-distance', async () => {
    const response = await GET(request({ test: 'sm-l2-distance' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.test).toBe('sm-l2-distance');
    expect(body.params.test).toBe('sm-l2-distance');
    expect(body.gpus).toHaveLength(1);
    const first = body.gpus[0];
    expect(first.numSms).toBeGreaterThan(0);
    expect(first.matrix.length).toBe(first.numSms);
    expect(first.stats.intraGpcMean).toBeGreaterThan(0);
    expect(first.stats.crossDieMean).toBeGreaterThan(first.stats.intraGpcMean);
  });

  it('returns every TPC Skyline grouping by default when test=tpc-skyline', async () => {
    const response = await GET(request({ test: 'tpc-skyline' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.test).toBe('tpc-skyline');
    expect(body.params).toEqual({ test: 'tpc-skyline', gpu: 'all' });
    expect(body.gpus.map((g: { gpu: string }) => g.gpu)).toEqual(Object.keys(TPC_SKYLINE_RUNS));
    const b200 = body.gpus.find((g: { gpu: string }) => g.gpu === 'B200 SXM');
    expect(b200.tpcsPerGpc).toEqual([10, 10, 10, 9, 9, 9, 9, 5, 1, 1, 1]);
    expect(b200).toMatchObject({ gpcCount: 11, tpcCount: 74, smCount: 148 });
  });

  it('returns one GPU and rejects unknown GPUs for tpc-skyline', async () => {
    const oneResponse = await GET(request({ test: 'tpc-skyline', gpu: 'H100 SXM' }));
    const one = await oneResponse.json();
    expect(one.gpus).toHaveLength(1);
    expect(one.gpus[0].tpcsPerGpc).toEqual([9, 9, 8, 8, 8, 8, 8, 4, 1, 1, 1, 1]);
    const bad = await GET(request({ test: 'tpc-skyline', gpu: 'MI355X' }));
    expect(bad.status).toBe(400);
  });

  it('filters the test=all TPC Skyline section by a case-insensitive GPU key', async () => {
    const response = await GET(request({ gpu: 'b200 sxm' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.memBw.gpus.map((g: { gpu: string }) => g.gpu)).toEqual(['B200 SXM']);
    expect(body.tpcSkyline.gpus.map((g: { gpu: string }) => g.gpu)).toEqual(['B200 SXM']);
  });

  it('matches the shared UI transform for every TPC Skyline grouping (parity)', async () => {
    const response = await GET(request({ test: 'tpc-skyline' }));
    const body = await response.json();
    expect(body.gpus).toEqual(
      Object.entries(TPC_SKYLINE_RUNS).map(([key, run]) => transformTpcSkylineRun(key, run)),
    );
  });

  it('rejects unknown query keys', async () => {
    const response = await GET(request({ unknown: 'test' }));
    expect(response.status).toBe(400);
  });

  it('produces the same rows as the shared UI transform (mem-bw parity) for every GPU', async () => {
    for (const gpuKey of UBENCHX_GPU_KEYS) {
      if (!(gpuKey in UBENCHX_RUNS)) continue;
      const response = await GET(request({ test: 'mem-bw', gpu: gpuKey }));
      const body = await response.json();
      const uiResult = transformUbenchxRun(gpuKey, UBENCHX_RUNS[gpuKey]);
      expect(body.gpus[0].rows).toEqual(uiResult.rows);
      expect(body.gpus[0].peakBandwidthGbps).toBe(uiResult.peakBandwidthGbps);
      expect(body.gpus[0].peakBandwidthSource).toBe(uiResult.peakBandwidthSource);
    }
  });

  it('produces the same stats as the shared UI transform (sm-l2 parity)', async () => {
    for (const gpuKey of Object.keys(SM_L2_RUNS)) {
      const response = await GET(request({ test: 'sm-l2-distance', gpu: gpuKey }));
      const body = await response.json();
      const uiResult = transformSmL2Run(gpuKey, SM_L2_RUNS[gpuKey]);
      expect(body.gpus[0].stats.intraGpcMean).toBeCloseTo(uiResult.stats.intraGpcMean, 4);
      expect(body.gpus[0].stats.crossDieMean).toBeCloseTo(uiResult.stats.crossDieMean, 4);
      expect(body.gpus[0].stats.interGpcSameDieMean).toBeCloseTo(
        uiResult.stats.interGpcSameDieMean,
        4,
      );
    }
  });

  it("derives MBU from each GPU's own peak bandwidth", async () => {
    const h100Res = await GET(request({ test: 'mem-bw', gpu: 'H100 SXM' }));
    const h100Body = await h100Res.json();
    const h100Last = h100Body.gpus[0].rows.at(-1);
    expect(h100Last.mbuPercent).toBeCloseTo((3053.14 / 3350) * 100, 4);

    const b300Res = await GET(request({ test: 'mem-bw', gpu: 'B300 SXM' }));
    const b300Body = await b300Res.json();
    const b300Last = b300Body.gpus[0].rows.at(-1);
    expect(b300Last.mbuPercent).toBeCloseTo((6655.8 / 8000) * 100, 4);

    const h200Res = await GET(request({ test: 'mem-bw', gpu: 'H200 SXM' }));
    const h200Body = await h200Res.json();
    const h200Last = h200Body.gpus[0].rows.at(-1);
    expect(h200Last.mbuPercent).toBeCloseTo((4305.39 / 4800) * 100, 4);
  });
});

it('returns the Ascend core profiles with raw timer units and leaves unavailable tests empty', async () => {
  const response = await GET(request({ test: 'all', gpu: 'ascend 950pr_9579' }));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.memBw.gpus).toEqual([]);
  expect(body.smL2Distance.gpus).toEqual([]);
  expect(body.tpcSkyline.gpus).toEqual([]);
  const run = body.coreMemoryProfiles.gpus[0];
  expect(run.gpu).toBe('Ascend 950PR_9579');
  expect(run.panels.map((panel: { coreIds: number[] }) => panel.coreIds.length)).toEqual([
    28, 28, 56, 56,
  ]);
  expect(run.panels[0].unit).toBe('SYS_CNT ticks');
  expect(run.panels[0].coreIds.slice(12, 16)).toEqual([14, 15, 54, 55]);
  expect(run.panels[0].stats.withinDieGroupMean).toBeCloseTo(18.55499211685, 8);
  expect(run.panels[0].stats.betweenDieGroupMean).toBeCloseTo(93.12987720723, 8);
  expect(run.panels[0].matrix[0][14]).toBeCloseTo(96.70648193359, 8);
  const onlyResponse = await GET(request({ test: 'core-memory-profiles' }));
  const only = await onlyResponse.json();
  expect(only.gpus).toEqual(body.coreMemoryProfiles.gpus);
  const missing = await GET(request({ test: 'core-memory-profiles', gpu: 'H100 SXM' }));
  expect(missing.status).toBe(400);
});

it('exposes Huawei rotating-copy evidence without inventing missing tests or sizes', async () => {
  const response = await GET(request({ test: 'all', gpu: 'huawei 950pr' }));
  expect(response.status).toBe(200);
  const body = await response.json();
  const run = body.memBw.gpus[0];
  expect(run.gpu).toBe('Huawei 950PR');
  expect(run.peakBandwidthGbps).toBe(1600);
  expect(run.peakBandwidthSource).toContain('not independently verified');
  expect(run.metadata).toMatchObject({
    protocol: 'rotating-pool-npu-graph',
    dtype: 'float16',
    missingSizesBytes: [],
  });
  expect(run.rows.some((row: { bytes: number }) => row.bytes === 17179869184)).toBe(true);
  const endpoint = run.rows.find((row: { bytes: number }) => row.bytes === 17179869184);
  expect(endpoint.bandwidthGbps).toBeCloseTo(1447.2735584561165, 6);
  expect(endpoint.mbuPercent).toBeCloseTo(90.45459740350728, 6);
  expect(endpoint.observations).toBe(360);
  expect(body.smL2Distance.gpus).toEqual([]);
  expect(body.tpcSkyline.gpus).toEqual([]);
});

it('preserves full-precision Huawei bandwidth arithmetic and API/UI normalization', async () => {
  for (const gpu of ['Huawei 950PR']) {
    const response = await GET(request({ test: 'mem-bw', gpu }));
    const body = await response.json();
    const run = body.gpus[0];
    expect(run).toEqual(transformUbenchxRun(gpu, UBENCHX_RUNS[gpu]));
    for (const row of run.rows) {
      expect(row.bandwidthGbps).toBeCloseTo((2 * row.bytes) / row.timeMs / 1e6, 6);
      expect(row.bandwidthP10Gbps).toBeLessThanOrEqual(row.bandwidthGbps);
      expect(row.bandwidthP90Gbps).toBeGreaterThanOrEqual(row.bandwidthGbps);
    }
  }
});

it('does not expose the removed 910B3 bandwidth series', async () => {
  const all = await GET(request({ test: 'mem-bw', gpu: 'all' }));
  const body = await all.json();
  expect(body.gpus.some((run: { gpu: string }) => run.gpu === 'Ascend 910B3')).toBe(false);
  const removed = await GET(request({ test: 'mem-bw', gpu: 'Ascend 910B3' }));
  expect(removed.status).toBe(400);
});
