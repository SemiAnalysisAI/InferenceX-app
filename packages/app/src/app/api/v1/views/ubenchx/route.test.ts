import { UBENCHX_GPU_KEYS, UBENCHX_RUNS } from '@/components/ubenchx/ubenchx-data';
import { transformUbenchxRun } from '@/components/ubenchx/ubenchx-transform';
import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/api-cache', () => ({
  cachedJson: (data: unknown) => Response.json(data),
  cachedQuery: (fn: unknown) => fn,
}));

const request = (params: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/v1/views/ubenchx?${new URLSearchParams(params)}`);

describe('ubenchx view', () => {
  it('returns the default GPU when no selector is provided', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.view).toBe('ubenchx');
    expect(body.apiVersion).toBe('v1');
    expect(body.params.gpu).toBe('H100 SXM');
    expect(body.gpus).toHaveLength(1);
    expect(body.gpus[0].gpu).toBe('H100 SXM');
    expect(body.gpus[0].rows.length).toBe(32);
  });

  it('returns all GPUs when gpu=all', async () => {
    const response = await GET(request({ gpu: 'all' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.params.gpu).toBe('all');
    expect(body.gpus).toHaveLength(Object.keys(UBENCHX_RUNS).length);
    // Verify all GPU keys are present.
    const returnedGpus = body.gpus.map((g: { gpu: string }) => g.gpu);
    for (const key of Object.keys(UBENCHX_RUNS)) {
      expect(returnedGpus).toContain(key);
    }
  });

  it('returns a specific GPU by name', async () => {
    const response = await GET(request({ gpu: 'B300 SXM' }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.params.gpu).toBe('B300 SXM');
    expect(body.gpus).toHaveLength(1);
    expect(body.gpus[0].gpu).toBe('B300 SXM');
    expect(body.gpus[0].rows.length).toBe(32);
  });

  it('rejects unknown query keys', async () => {
    const response = await GET(request({ unknown: 'test' }));
    expect(response.status).toBe(400);
  });

  it('produces the same rows as the shared UI transform (parity) for every GPU', async () => {
    for (const gpuKey of UBENCHX_GPU_KEYS) {
      if (!(gpuKey in UBENCHX_RUNS)) continue;
      const response = await GET(request({ gpu: gpuKey }));
      const body = await response.json();
      const uiResult = transformUbenchxRun(gpuKey, UBENCHX_RUNS[gpuKey]);
      expect(body.gpus[0].rows).toEqual(uiResult.rows);
      expect(body.gpus[0].peakBandwidthGbps).toBe(uiResult.peakBandwidthGbps);
      expect(body.gpus[0].peakBandwidthSource).toBe(uiResult.peakBandwidthSource);
    }
  });

  it("derives MBU from each GPU's own peak bandwidth", async () => {
    // H100 SXM: 16 GiB row: bandwidth 3053.14 GB/s, peak 3350 GB/s
    const h100Res = await GET(request({ gpu: 'H100 SXM' }));
    const h100Body = await h100Res.json();
    const h100Last = h100Body.gpus[0].rows.at(-1);
    expect(h100Last.mbuPercent).toBeCloseTo((3053.14 / 3350) * 100, 4);

    // B300 SXM: 16 GiB row: bandwidth 6655.80 GB/s, peak 8000 GB/s
    const b300Res = await GET(request({ gpu: 'B300 SXM' }));
    const b300Body = await b300Res.json();
    const b300Last = b300Body.gpus[0].rows.at(-1);
    expect(b300Last.mbuPercent).toBeCloseTo((6655.8 / 8000) * 100, 4);

    // H200 SXM: 16 GiB row: bandwidth 4305.39 GB/s, peak 4800 GB/s
    const h200Res = await GET(request({ gpu: 'H200 SXM' }));
    const h200Body = await h200Res.json();
    const h200Last = h200Body.gpus[0].rows.at(-1);
    expect(h200Last.mbuPercent).toBeCloseTo((4305.39 / 4800) * 100, 4);
  });
});
