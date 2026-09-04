import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/api-cache', () => ({
  cachedJson: (data: unknown) => Response.json(data),
}));

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/views/options', () => {
  it('returns every option domain with the envelope', async () => {
    const res = await GET(request('/api/v1/views/options'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.view).toBe('options');
    expect(body.apiVersion).toBe('v1');
    expect(body.params).toEqual({ format: 'json' });

    for (const domain of [
      'models',
      'sequences',
      'precisions',
      'hardware',
      'frameworks',
      'specMethods',
      'percentiles',
      'xAxisModes',
      'scaleModes',
      'metrics',
      'quickFilters',
      'reliabilityRanges',
      'overview',
      'calculator',
      'fleet',
      'defaults',
    ]) {
      expect(body[domain], domain).toBeDefined();
    }
  });

  it('describes models with db keys, category and release date', async () => {
    const bodyRes = await GET(request('/api/v1/views/options'));
    const body = await bodyRes.json();
    const dsv4 = body.models.find((m: { name: string }) => m.name === 'DeepSeek-V4-Pro');
    expect(dsv4).toBeDefined();
    expect(dsv4.dbKeys).toContain('dsv4');
    expect(typeof dsv4.category).toBe('string');
    expect(body.models.every((m: { dbKeys: string[] }) => m.dbKeys.length > 0)).toBe(true);
  });

  it('describes sequences with isl/osl and deprecation flags', async () => {
    const bodyRes = await GET(request('/api/v1/views/options'));
    const body = await bodyRes.json();
    const eightOne = body.sequences.find((s: { key: string }) => s.key === '8k/1k');
    expect(eightOne).toMatchObject({ isl: 8192, osl: 1024, deprecated: false });
    const agentic = body.sequences.find((s: { key: string }) => s.key === 'agentic-traces');
    expect(agentic).toBeDefined();
    expect(agentic.isl).toBeNull();
  });

  it('describes hardware and metrics from the registries', async () => {
    const bodyRes = await GET(request('/api/v1/views/options'));
    const body = await bodyRes.json();
    const h200 = body.hardware.find((h: { key: string }) => h.key === 'h200');
    expect(h200.vendor).toBe('NVIDIA');
    expect(h200.costPerHour.h).toBeGreaterThan(0);

    const metric = body.metrics.find((m: { configKey: string }) => m.configKey === 'y_tpPerGpu');
    expect(metric).toBeDefined();
    expect(metric.label.length).toBeGreaterThan(0);
    expect(metric.labelZh.length).toBeGreaterThan(0);
    expect(metric.polarity).toBe('higher');
  });

  it('exposes dashboard-parity defaults', async () => {
    const bodyRes = await GET(request('/api/v1/views/options'));
    const body = await bodyRes.json();
    expect(body.defaults).toMatchObject({
      model: 'DeepSeek-V4-Pro',
      sequence: '8k/1k',
      metric: 'y_tokensPerDollarH',
      percentile: 'p90',
      xmode: 'interactivity',
    });
    expect(body.quickFilters.vendors).toEqual(['NVIDIA', 'AMD']);
  });

  it('rejects format=csv (JSON-only endpoint)', async () => {
    const res = await GET(request('/api/v1/views/options?format=csv'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.param).toBe('format');
    expect(body.allowed).toEqual(['json']);
  });
});
