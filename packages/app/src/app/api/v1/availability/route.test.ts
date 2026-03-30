import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetAvailabilityData, mockGetDb } = vi.hoisted(() => ({
  mockGetAvailabilityData: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  JSON_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/workflow-info', () => ({
  getAvailabilityData: mockGetAvailabilityData,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: Function) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/availability', () => {
  it('returns availability data', async () => {
    const mockData = { dsr1: ['2026-03-01', '2026-03-02'], llama70b: ['2026-03-01'] };
    mockGetAvailabilityData.mockResolvedValueOnce(mockData);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockData);
    expect(mockGetAvailabilityData).toHaveBeenCalledWith('mock-sql');
  });

  it('returns empty object when no data', async () => {
    mockGetAvailabilityData.mockResolvedValueOnce({});

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});
  });

  it('returns 500 when query throws', async () => {
    mockGetAvailabilityData.mockRejectedValueOnce(new Error('Connection failed'));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
