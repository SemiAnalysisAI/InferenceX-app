import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetServerLogFileNames, mockGetDb } = vi.hoisted(() => ({
  mockGetServerLogFileNames: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/server-logs', () => ({
  getServerLogFileNames: mockGetServerLogFileNames,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const req = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

beforeEach(() => vi.clearAllMocks());

describe('GET /api/v1/server-log-files', () => {
  it('returns artifact-relative filenames in database order', async () => {
    mockGetServerLogFileNames.mockResolvedValueOnce([
      'results/server.log',
      'results/benchmark.log',
      'results/router.log',
    ]);
    const response = await GET(req('/api/v1/server-log-files?id=439516'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      'results/server.log',
      'results/benchmark.log',
      'results/router.log',
    ]);
  });

  it('returns 404 when no log bundle is linked', async () => {
    mockGetServerLogFileNames.mockResolvedValueOnce(null);
    const response = await GET(req('/api/v1/server-log-files?id=9'));
    expect(response.status).toBe(404);
  });
});
