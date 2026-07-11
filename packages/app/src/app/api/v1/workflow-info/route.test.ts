import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockGetWorkflowRunsByDate,
  mockGetChangelogByDate,
  mockGetDateConfigs,
  mockGetRunConfigsByDate,
  mockGetDb,
} = vi.hoisted(() => ({
  mockGetWorkflowRunsByDate: vi.fn(),
  mockGetChangelogByDate: vi.fn(),
  mockGetDateConfigs: vi.fn(),
  mockGetRunConfigsByDate: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/workflow-info', () => ({
  getWorkflowRunsByDate: mockGetWorkflowRunsByDate,
  getChangelogByDate: mockGetChangelogByDate,
  getDateConfigs: mockGetDateConfigs,
  getRunConfigsByDate: mockGetRunConfigsByDate,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: any[]) => any) => fn,
  cachedJson: (data: unknown) => Response.json(data),
}));

import { GET } from './route';
import { NextRequest } from 'next/server';

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/workflow-info', () => {
  it('returns 400 for invalid date format', async () => {
    const res = await GET(req('/api/v1/workflow-info?date=03-01-2026'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid date format (YYYY-MM-DD required)');
  });

  it('returns 400 for partial date', async () => {
    const res = await GET(req('/api/v1/workflow-info?date=2026-03'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid date format (YYYY-MM-DD required)');
  });

  it('returns 400 for date with extra chars', async () => {
    const res = await GET(req('/api/v1/workflow-info?date=2026-03-01T00:00'));
    expect(res.status).toBe(400);
  });

  it('returns workflow info for valid date', async () => {
    const mockRuns = [{ id: 1, status: 'completed' }];
    const mockChangelogs = [{ version: '1.0', changes: 'Initial' }];
    const mockConfigs = [{ model: 'dsr1', gpu: 'h200' }];
    const mockRunConfigs = [
      { github_run_id: 1, model: 'dsr1', hardware: 'h200', framework: 'vllm' },
    ];
    mockGetWorkflowRunsByDate.mockResolvedValueOnce(mockRuns);
    mockGetChangelogByDate.mockResolvedValueOnce(mockChangelogs);
    mockGetDateConfigs.mockResolvedValueOnce(mockConfigs);
    mockGetRunConfigsByDate.mockResolvedValueOnce(mockRunConfigs);

    const res = await GET(req('/api/v1/workflow-info?date=2026-03-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      runs: mockRuns,
      changelogs: mockChangelogs,
      configs: mockConfigs,
      runConfigs: mockRunConfigs,
    });
    expect(mockGetWorkflowRunsByDate).toHaveBeenCalledWith('mock-sql', '2026-03-01');
    expect(mockGetChangelogByDate).toHaveBeenCalledWith('mock-sql', '2026-03-01');
    expect(mockGetDateConfigs).toHaveBeenCalledWith('mock-sql', '2026-03-01');
    expect(mockGetRunConfigsByDate).toHaveBeenCalledWith('mock-sql', '2026-03-01');
  });

  it('accepts empty date param (returns all)', async () => {
    mockGetWorkflowRunsByDate.mockResolvedValueOnce([]);
    mockGetChangelogByDate.mockResolvedValueOnce([]);
    mockGetDateConfigs.mockResolvedValueOnce([]);
    mockGetRunConfigsByDate.mockResolvedValueOnce([]);

    const res = await GET(req('/api/v1/workflow-info'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ runs: [], changelogs: [], configs: [], runConfigs: [] });
    expect(mockGetWorkflowRunsByDate).toHaveBeenCalledWith('mock-sql', '');
  });

  it('returns 500 when any query throws', async () => {
    mockGetWorkflowRunsByDate.mockRejectedValueOnce(new Error('Timeout'));
    mockGetChangelogByDate.mockResolvedValueOnce([]);
    mockGetDateConfigs.mockResolvedValueOnce([]);
    mockGetRunConfigsByDate.mockResolvedValueOnce([]);

    const res = await GET(req('/api/v1/workflow-info?date=2026-03-01'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
