import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetOverviewPageData, mockCachedJson } = vi.hoisted(() => ({
  mockGetOverviewPageData: vi.fn(),
  mockCachedJson: vi.fn((data: unknown) => Response.json(data)),
}));

vi.mock('@/lib/overview-data.server', () => ({
  getOverviewPageData: mockGetOverviewPageData,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedJson: mockCachedJson,
}));

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/overview', () => {
  it('returns the resolved overview selection as cached JSON', async () => {
    const data = {
      tier: 75,
      engineScope: 'all',
      comparisonMode: 'history',
      referenceHardware: 'b300',
      models: [],
      historicalWindow: null,
    };
    mockGetOverviewPageData.mockResolvedValueOnce(data);

    const response = await GET(
      request('/api/v1/overview?tier=75&engine=all&compare=60d&ref=b300&models=all&hw=b300,gb300'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
    expect(mockGetOverviewPageData).toHaveBeenCalledWith(75, 'all', 'history', 'b300', 'all', 60, [
      'b300',
      'gb300',
    ]);
    expect(mockCachedJson).toHaveBeenCalledWith(data);
  });

  it('normalizes unsupported query values to overview defaults', async () => {
    mockGetOverviewPageData.mockResolvedValueOnce({ models: [] });

    await GET(
      request('/api/v1/overview?tier=999&engine=vendor&compare=weekly&ref=h100&models=inactive'),
    );

    expect(mockGetOverviewPageData).toHaveBeenCalledWith(
      50,
      'community',
      'hardware',
      'b200',
      'default',
      30,
      ['b200', 'mi355x', 'b300', 'gb200', 'gb300'],
    );
  });

  it('returns 500 when overview assembly fails', async () => {
    mockGetOverviewPageData.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await GET(request('/api/v1/overview?tier=100'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
  });
});
