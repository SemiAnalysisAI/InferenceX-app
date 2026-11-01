import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/cache/api-cache', () => ({
  cachedJson: (_request: Request, data: unknown) => Response.json(data),
}));

import { LIFECYCLE_DEFAULTS } from '@/components/calculator/lifecycle';
import { VENDOR_ORDER } from '@/components/inference/utils/quickFilters';
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
    expect(dsv4.category).toBe('deprecated');
    expect(body.models.every((m: { dbKeys: string[] }) => m.dbKeys.length > 0)).toBe(true);
    expect(body.models.find((m: { name: string }) => m.name === 'MiniMax-M3')).toMatchObject({
      dbKeys: ['minimaxm3'],
      category: 'deprecated',
    });
    expect(
      body.models.find((m: { name: string }) => m.name === 'MiniMax-M3.1-Flash'),
    ).toMatchObject({
      category: 'default',
    });
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

  it('returns default models in selector order without changing the selected default', async () => {
    const res = await GET(request('/api/v1/views/options'));
    const body = await res.json();
    expect(
      body.models
        .filter((model: { category: string }) => model.category === 'default')
        .map((model: { name: string }) => model.name),
    ).toEqual([
      'Kimi-K3',
      'DeepSeek-V4.1-Flash',
      'GLM-5.2',
      'MiniMax-M3.1-Flash',
      'Muse-Spark-Open',
      'Qwen-3.5-397B-A17B',
      'Qwen3.8-Flash-Next',
    ]);
    expect(body.defaults.model).toBe('DeepSeek-V4-Pro');
    expect(body.models.some((model: { category: string }) => model.category === 'hidden')).toBe(
      false,
    );
  });

  it('exposes model-specific sequence retirement without retiring Qwen3.5 or global 8K/1K', async () => {
    const res = await GET(request('/api/v1/views/options'));
    const body = await res.json();
    const qwen = body.models.find((model: { name: string }) => model.name === 'Qwen-3.5-397B-A17B');
    expect(qwen.category).toBe('default');
    expect(qwen.deprecatedSequences).toContain('8k/1k');
    expect(qwen.deprecatedSequences).toContain('1k/1k');
    expect(qwen.deprecatedSequences).not.toContain('agentic-traces');
    expect(
      body.sequences.find((sequence: { key: string }) => sequence.key === '8k/1k'),
    ).toMatchObject({
      deprecated: false,
    });
    const dsr1 = body.models.find((model: { name: string }) => model.name === 'DeepSeek-R1-0528');
    expect(dsr1.deprecatedSequences).not.toContain('8k/1k');
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
    expect(body.quickFilters.vendors).toEqual(VENDOR_ORDER);
    expect(body.quickFilters.deployments).toEqual(['single-node', 'multi-node', 'disagg']);
    expect(body.fleet.defaults).toEqual({
      rampMonths: LIFECYCLE_DEFAULTS.rampMonths,
      cachedInputPricePercent: LIFECYCLE_DEFAULTS.cachedInputPct,
      mtbiDays: LIFECYCLE_DEFAULTS.mtbiDays,
      recoveryHours: LIFECYCLE_DEFAULTS.recoveryHours,
    });
    expect(body.overview.tiers).toEqual([30, 50, 75, 100, 150, 200]);
    expect(body.overview.windows).toEqual(['hardware', '7d', '30d', '60d', '90d']);
  });

  it('rejects format=csv (JSON-only endpoint)', async () => {
    const res = await GET(request('/api/v1/views/options?format=csv'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.param).toBe('format');
    expect(body.allowed).toEqual(['json']);
  });
});
