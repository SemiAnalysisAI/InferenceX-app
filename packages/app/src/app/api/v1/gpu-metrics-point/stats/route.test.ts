import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';

import type { GpuPowerSeries } from '@/components/gpu-power/power-series';
import { poolSubsetSeries } from '@/components/inference/utils/powerTimeline';
import { loadSwingStatsFromSeries } from '@/lib/power/load-swing-stats';

const { readRevision, readCached, stored } = {
  readRevision: vi.fn(),
  readCached: vi.fn(),
  stored: vi.fn(),
};

mock.module('@semianalysisai/inferencex-db/connection', () => ({ getDb: () => ({}) }));
mock.module('@semianalysisai/inferencex-db/queries/gpu-metrics-revision', () => ({
  getGpuMetricsPointRevision: readRevision,
}));
mock.module('@semianalysisai/inferencex-db/queries/gpu-metrics', () => ({
  getGpuMetricsForPoint: vi.fn(),
}));
mock.module('@semianalysisai/inferencex-db/power-series/stored-power-series', () => ({
  storedPowerSeries: stored,
}));
mock.module('@/lib/cache/api-cache', () => ({
  cachedQuery: () => readCached,
  cachedJson: (_request: Request, data: unknown) =>
    Response.json(data, { headers: { 'Cache-Control': 'public, max-age=3600' } }),
  cachedText: (data: string, contentType: string) =>
    new Response(data, { headers: { 'Content-Type': contentType } }),
  // ../route imports it. The stats handler uses ../route only for CACHE_KEY_PREFIX.
  notModifiedJson: () => null,
}));

// Imported after mock.module so the route's payload reader is the mocked cachedQuery result.
const { GET } = await import('./route');

const samples = [
  100, 100, 100, 110, 100, 300, 500, 520, 480, 500, 520, 480, 500, 500, 520, 480, 500, 300, 150,
  100,
];
const startMs = 1_700_000_000_000;
const series: GpuPowerSeries = {
  artifact: 'power_audit_sweep',
  source: 'power_validation_point.json',
  startMs,
  bucketSeconds: 1,
  gpus: [0, 1],
  t: samples.map((_, i) => i),
  power: [samples, samples.map((v) => v - 20)],
};
const payload = {
  benchmarkResultId: 7,
  series: [
    {
      artifactName: 'power_audit_sweep',
      powerAudits: [
        { source: 'bundle/power_validation_other.json', window_start_unix: 1, window_end_unix: 2 },
        {
          source: 'bundle/power_validation_point.json',
          window_start_unix: startMs / 1000 + 7,
          window_end_unix: startMs / 1000 + 16,
        },
      ],
    },
  ],
};

function request(query: string) {
  return new NextRequest(`http://localhost/api/v1/gpu-metrics-point/stats?${query}`);
}

async function getBody(query: string, as: 'json' | 'text' = 'json') {
  const response = await GET(request(query));
  return as === 'json' ? response.json() : response.text();
}

beforeEach(() => {
  vi.resetAllMocks();
  stored.mockReturnValue([series]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/v1/gpu-metrics-point/stats', () => {
  it('returns the same statistics the Over time view computes, with the point window', async () => {
    readRevision.mockResolvedValue('rev-1');
    readCached.mockResolvedValue(payload);
    const response = await GET(request('id=7'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.json();
    expect(body).toMatchObject({
      benchmarkResultId: 7,
      apiVersion: 'v1',
      scale: 'gpu',
      unit: 'W per GPU',
      gpusPerRack: 72,
    });
    expect(body.caveats).toHaveLength(3);
    expect(body.series).toHaveLength(1);
    expect(body.series[0]).toMatchObject({
      artifact: 'power_audit_sweep',
      source: 'power_validation_point.json',
      gpuCount: 2,
      window: { startSeconds: 7, endSeconds: 16 },
    });
    expect(body.series[0].stats).toEqual(
      loadSwingStatsFromSeries(series, startMs + 7000, startMs + 16000),
    );
    expect(body.series[0].stats.peak).toBe(510);
    expect(body.series[0].stats.idleFloor).toBe(90);
    expect(readCached).toHaveBeenCalledWith(7, 'rev-1');
  });

  it('scales to an NVL72 rack on request', async () => {
    readRevision.mockResolvedValue('rev-1');
    readCached.mockResolvedValue(payload);
    const response = await GET(request('id=7&scale=nvl72'));
    const body = await response.json();
    expect(body.unit).toBe('kW per NVL72 rack');
    expect(body.series[0].stats.peak).toBeCloseTo((510 * 72) / 1000, 9);
    expect(body.series[0].stats.volatility).toBe(
      loadSwingStatsFromSeries(series, startMs + 7000, startMs + 16000)!.volatility,
    );
  });

  it('exports the per-second trace as CSV', async () => {
    readRevision.mockResolvedValue('rev-1');
    readCached.mockResolvedValue(payload);
    const response = await GET(request('id=7&format=csv'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    const text = await response.text();
    const lines = text.trim().split(/\r?\n/u);
    expect(lines[0]).toBe('artifact,source,t_s,since_serving_s,in_validated_window,w_per_gpu');
    expect(lines).toHaveLength(21);
    expect(lines[1]).toBe('power_audit_sweep,power_validation_point.json,0,-7,0,90');
    expect(lines[8]).toBe('power_audit_sweep,power_validation_point.json,7,0,1,510');
    // The NVL72 scale swaps the column for kW per rack: per-GPU W × 72 / 1000.
    const rack = await GET(request('id=7&scale=nvl72&format=csv'));
    const rackText = await rack.text();
    const rackLines = rackText.trim().split(/\r?\n/u);
    expect(rackLines[0]).toBe(
      'artifact,source,t_s,since_serving_s,in_validated_window,kw_per_nvl72_rack',
    );
    expect(rackLines[1]).toBe('power_audit_sweep,power_validation_point.json,0,-7,0,6.48');
  });

  it('rejects bad ids, formats and scales without touching the database', async () => {
    for (const query of ['id=0', 'id=1.5', 'id=7&format=xml', 'id=7&scale=rack']) {
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(readRevision).not.toHaveBeenCalled();
  });

  it('returns 404 when the point has no telemetry or no usable power series', async () => {
    readRevision.mockResolvedValue(null);
    const missing = await GET(request('id=7'));
    expect(missing.status).toBe(404);
    readRevision.mockResolvedValue('rev-1');
    readCached.mockResolvedValue(payload);
    stored.mockReturnValue([]);
    const noSeries = await GET(request('id=7'));
    expect(noSeries.status).toBe(404);
    const noCsv = await GET(request('id=7&format=csv'));
    expect(noCsv.status).toBe(404);
  });

  describe('GPU role pools', () => {
    const disagg: GpuPowerSeries = {
      ...series,
      gpus: [0, 1, 2],
      power: [samples, samples.map((v) => v - 20), samples.map((v) => v + 40)],
      devices: (['prefill', 'decode', 'decode'] as const).map((role) => ({ id: role, role })),
    };

    it('computes each pool from only its GPU rows, with the same function as the lanes', async () => {
      readRevision.mockResolvedValue('rev-1');
      readCached.mockResolvedValue(payload);
      stored.mockReturnValue([disagg]);
      const decode = await getBody('id=7&role=decode');
      expect(decode.role).toBe('decode');
      expect(decode.series).toHaveLength(1);
      expect(decode.series[0]).toMatchObject({ role: 'decode', gpuCount: 2 });
      expect(decode.series[0].stats).toEqual(
        loadSwingStatsFromSeries(
          poolSubsetSeries(disagg, 'decode')!,
          startMs + 7000,
          startMs + 16000,
        ),
      );
      const split = await getBody('id=7&role=split');
      expect(split.series.map((entry: { role: string }) => entry.role)).toEqual([
        'prefill',
        'decode',
      ]);
      // The prefill pool is GPU 0 alone, so its peak is that GPU's 520 W, not the 510 W mean.
      expect(split.series[0].stats.peak).toBe(520);
      const csv = await getBody('id=7&role=prefill&format=csv', 'text');
      expect(csv.split(/\r?\n/u)[0]).toBe(
        'artifact,source,role,t_s,since_serving_s,in_validated_window,w_per_gpu',
      );
    });

    it('returns 404 for a role on an aggregated trace instead of the all-GPU numbers', async () => {
      const badRole = await GET(request('id=7&role=roles'));
      expect(badRole.status).toBe(400);
      readRevision.mockResolvedValue('rev-1');
      readCached.mockResolvedValue(payload);
      const response = await GET(request('id=7&role=prefill'));
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain('aggregated');
      const csv = await GET(request('id=7&role=decode&format=csv'));
      expect(csv.status).toBe(404);
    });
  });
});
