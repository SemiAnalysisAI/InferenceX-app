import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-cache', () => ({
  cachedJson: (data: unknown) => Response.json(data),
  cachedText: (data: string, contentType: string) =>
    new Response(data, { headers: { 'Content-Type': contentType } }),
}));

import { GPU_CHART_METRICS, GPU_SPECS, parseNumericFromString } from '@/lib/gpu-specs';

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/views/gpu-specs', () => {
  it('returns every chip with raw fields plus numeric projections', async () => {
    const res = await GET(request('/api/v1/views/gpu-specs'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.view).toBe('gpu-specs');
    expect(body.apiVersion).toBe('v1');
    expect(body.params).toEqual({ metric: null, format: 'json' });
    expect(body.chips).toHaveLength(GPU_SPECS.length);
    expect(body.ranking).toBeUndefined();

    const h100 = body.chips.find((chip: { key: string }) => chip.key === 'h100-sxm');
    expect(h100).toMatchObject({
      label: 'H100 SXM',
      name: 'H100 SXM',
      vendor: 'nvidia',
      memory: '80 GB',
      memoryGB: 80,
      memoryBandwidthTBs: 3.35,
      fp4Tflops: null,
      fp8Tflops: 1979,
      bf16Tflops: 989,
      scaleUpBandwidthGBs: 450,
      scaleUpWorldSize: 8,
    });
    // Derived domain metrics: usable memory × world size.
    expect(h100.domainMemoryTB).toBeCloseTo(0.64, 10);
    expect(h100.domainMemoryBandwidthTBs).toBeCloseTo(26.8, 10);
  });

  it('exposes the chart-metric metadata', async () => {
    const res = await GET(request('/api/v1/views/gpu-specs'));
    const body = await res.json();
    expect(body.metrics).toEqual(
      GPU_CHART_METRICS.map(({ key, label, unit }) => ({ key, label, unit })),
    );
  });

  it('adds a descending ranking when metric is set (parity with getValue)', async () => {
    const res = await GET(request('/api/v1/views/gpu-specs?metric=memory'));
    const body = await res.json();
    expect(body.params.metric).toBe('memory');

    const metric = GPU_CHART_METRICS.find((entry) => entry.key === 'memory')!;
    const expected = GPU_SPECS.map((spec) => metric.getValue(spec))
      .filter((value): value is number => value !== null)
      .toSorted((a, b) => b - a);
    expect(body.ranking.map((entry: { value: number }) => entry.value)).toEqual(expected);
    expect(body.ranking[0].rank).toBe(1);
    expect(body.ranking.at(-1).rank).toBe(body.ranking.length);
  });

  it('omits chips without a value from the ranking (fp4 on Hopper)', async () => {
    const res = await GET(request('/api/v1/views/gpu-specs?metric=fp4'));
    const body = await res.json();
    const chips = body.ranking.map((entry: { chip: string }) => entry.chip);
    expect(chips).not.toContain('h100-sxm');
    expect(body.ranking.length).toBe(GPU_SPECS.filter((spec) => spec.fp4 !== null).length);
  });

  it('resolves metric case-insensitively', async () => {
    const res = await GET(request('/api/v1/views/gpu-specs?metric=memoryBANDWIDTH'));
    const body = await res.json();
    expect(body.params.metric).toBe('memoryBandwidth');
  });

  it('rejects an unknown metric with the allowed list', async () => {
    const res = await GET(request('/api/v1/views/gpu-specs?metric=tdp'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.param).toBe('metric');
    expect(body.allowed).toEqual(GPU_CHART_METRICS.map((entry) => entry.key));
  });

  it('returns a CSV representation with one row per chip', async () => {
    const res = await GET(request('/api/v1/views/gpu-specs?format=csv'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const resText = await res.text();
    const lines = resText.trim().split('\r\n');
    expect(lines).toHaveLength(GPU_SPECS.length + 1);
    expect(lines[0].startsWith('key,label,name,vendor,')).toBe(true);
  });

  it('adds metric value and rank columns to CSV when metric is set', async () => {
    const res = await GET(request('/api/v1/views/gpu-specs?metric=memory&format=csv'));
    const resText = await res.text();
    const lines = resText.trim().split('\r\n');
    expect(lines[0]).toContain('metricValue');
    expect(lines[0]).toContain('metricRank');
    const h100 = lines.find((line) => line.startsWith('h100-sxm,'))!;
    expect(h100).toContain(String(parseNumericFromString('80 GB')));
  });

  it('rejects an unknown format', async () => {
    const res = await GET(request('/api/v1/views/gpu-specs?format=xlsx'));
    expect(res.status).toBe(400);
    const resBody = await res.json();
    expect(resBody.param).toBe('format');
  });
});
