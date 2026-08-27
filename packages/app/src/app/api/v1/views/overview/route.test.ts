import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OverviewPageData } from '@/lib/overview-data';

const { mockGetOverviewPageData, mockCachedJson, mockCachedText } = vi.hoisted(() => ({
  mockGetOverviewPageData: vi.fn(),
  mockCachedJson: vi.fn((data: unknown) => Response.json(data)),
  mockCachedText: vi.fn(
    (data: string, contentType: string) =>
      new Response(data, { headers: { 'Content-Type': contentType } }),
  ),
}));

vi.mock('@/lib/overview-data.server', () => ({
  getOverviewPageData: mockGetOverviewPageData,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedJson: mockCachedJson,
  cachedText: mockCachedText,
}));

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

function pageData(): OverviewPageData {
  return {
    models: [
      {
        model: 'DeepSeek-V4-Pro',
        modelLabel: 'DeepSeekv4 Pro 0813 1.6T',
        category: 'default',
        scenario: 'single_turn_8k1k',
        platforms: [
          {
            hardware: 'b200',
            hardwareLabel: 'B200',
            precision: 'fp4',
            read: {
              tier: 50,
              value: 9000,
              boundary: null,
              estimated: true,
              evidenceDate: { from: '2026-08-01', to: '2026-08-20' },
              evidenceTopologies: ['TP8'],
              config: {
                key: 'cfg-a',
                dbModel: 'dsv4',
                hardware: 'b200',
                hwKey: 'b200_sglang',
                framework: 'sglang',
                frameworkLabel: 'SGLang',
                specMethod: 'mtp',
                specLabel: 'MTP',
                disagg: false,
                isMultinode: true,
                precision: 'fp4',
                sourceRunUrls: [],
                latestDate: '2026-08-20',
              },
            },
            missingReason: null,
            costPerMtok: 0.42,
            costVsReferencePct: null,
            historicalComparison: null,
          },
          {
            hardware: 'mi355x',
            hardwareLabel: 'MI355X',
            precision: null,
            read: {
              tier: 50,
              value: null,
              boundary: null,
              estimated: false,
              evidenceDate: null,
              evidenceTopologies: [],
              config: null,
            },
            missingReason: 'cannot_reach_at_tier',
            costPerMtok: null,
            costVsReferencePct: null,
            historicalComparison: {
              status: 'comparable',
              baselineCostPerMtok: 0.61,
              costDeltaPct: -8.3,
              baselineDate: '2026-07-20',
              baselineConfig: null,
            },
          },
        ],
      },
    ],
    tier: 50,
    engineScope: 'community',
    comparisonMode: 'hardware',
    referenceHardware: 'b200',
    modelScope: 'default',
    rowScope: 'all',
    hardwareRowScope: 'all',
    unchangedRowCount: 0,
    emptyRowCount: 2,
    historicalWindow: null,
  } as unknown as OverviewPageData;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/views/overview', () => {
  it('returns the documented projection with defaults resolved', async () => {
    mockGetOverviewPageData.mockResolvedValueOnce(pageData());

    const response = await GET(request('/api/v1/views/overview'));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(mockGetOverviewPageData).toHaveBeenCalledWith(
      50,
      'community',
      'hardware',
      'b200',
      'default',
      'all',
      'all',
    );
    expect(body.view).toBe('overview');
    expect(body.apiVersion).toBe('v1');
    expect(body.generatedAt).toBe('2026-08-20');
    expect(body.params).toEqual({
      tier: 50,
      engine: 'community',
      compare: 'hardware',
      ref: 'b200',
      models: 'default',
      rows: 'all',
      hwrows: 'all',
      format: 'json',
    });
    expect(body.tiers).toEqual([30, 50, 75, 100, 150, 200]);
    expect(body.scenarios).toEqual(['single_turn_8k1k', 'agentx']);
    expect(body.rows).toHaveLength(1);
    const row = body.rows[0];
    expect(row.model).toBe('DeepSeek-V4-Pro');
    expect(row.scenario).toBe('single_turn_8k1k');
    expect(row.cells).toHaveLength(2);
    // Cell projection: page-internal fields (boundary, evidence, hwKey) stay out.
    expect(row.cells[0]).toEqual({
      hardware: 'b200',
      hardwareLabel: 'B200',
      costPerMtok: 0.42,
      throughputPerGpu: 9000,
      estimated: true,
      deltaVsRefPct: null,
      missingReason: null,
      config: {
        framework: 'sglang',
        frameworkLabel: 'SGLang',
        precision: 'fp4',
        specMethod: 'mtp',
        specLabel: 'MTP',
        disagg: false,
        multinode: true,
        latestDate: '2026-08-20',
      },
    });
    expect(row.cells[1].history).toEqual({
      status: 'comparable',
      baselineCostPerMtok: 0.61,
      costDeltaPct: -8.3,
      baselineDate: '2026-07-20',
    });
    expect(row.cells[1].config).toBeNull();
  });

  it('passes explicit params through to getOverviewPageData and echoes them', async () => {
    mockGetOverviewPageData.mockResolvedValueOnce(pageData());

    const response = await GET(
      request(
        '/api/v1/views/overview?tier=75&engine=all&compare=30d&ref=gb200&models=all&rows=changed&hwrows=priced',
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(mockGetOverviewPageData).toHaveBeenCalledWith(
      75,
      'all',
      '30d',
      'gb200',
      'all',
      'changed',
      'priced',
    );
    expect(body.params.tier).toBe(75);
    expect(body.params.compare).toBe('30d');
  });

  it('rejects an unknown tier with the allowed list', async () => {
    const response = await GET(request('/api/v1/views/overview?tier=42'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Unknown tier: 42',
      param: 'tier',
      allowed: ['30', '50', '75', '100', '150', '200'],
    });
    expect(mockGetOverviewPageData).not.toHaveBeenCalled();
  });

  it('rejects an unknown compare mode with the allowed list', async () => {
    const response = await GET(request('/api/v1/views/overview?compare=weekly'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.param).toBe('compare');
    expect(body.allowed).toEqual(['hardware', '7d', '30d', '60d', '90d']);
  });

  it('serves format=csv as one flat row per matrix cell', async () => {
    mockGetOverviewPageData.mockResolvedValueOnce(pageData());

    const response = await GET(request('/api/v1/views/overview?format=csv'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    const text = await response.text();
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toContain('model');
    expect(lines[0]).toContain('cost_per_mtok');
    expect(lines).toHaveLength(3); // header + 2 cells
    expect(lines[1]).toContain('b200');
    expect(lines[1]).toContain('0.42');
    expect(lines[2]).toContain('cannot_reach_at_tier');
  });

  it('returns 500 when overview assembly fails', async () => {
    mockGetOverviewPageData.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await GET(request('/api/v1/views/overview'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
