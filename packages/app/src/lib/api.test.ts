import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  fetchBenchmarks,
  fetchWorkflowInfo,
  fetchAvailability,
  fetchReliability,
  fetchEvaluations,
} from './api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function mockOk(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockError(status: number, statusText: string) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText,
  });
}

describe('fetchBenchmarks', () => {
  it('fetches with correct URL and params', async () => {
    mockOk([]);
    await fetchBenchmarks('DeepSeek-R1-0528');
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/benchmarks?model=DeepSeek-R1-0528');
  });

  it('includes date param when provided', async () => {
    mockOk([]);
    await fetchBenchmarks('DeepSeek-R1-0528', '2026-02-27');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-02-27',
    );
  });

  it('returns parsed JSON on success', async () => {
    const data = [{ hardware: 'h200', metrics: {} }];
    mockOk(data);
    const result = await fetchBenchmarks('dsr1');
    expect(result).toEqual(data);
  });

  it('throws on API error', async () => {
    mockError(500, 'Internal Server Error');
    await expect(fetchBenchmarks('dsr1')).rejects.toThrow('API error: 500 Internal Server Error');
  });
});

describe('fetchWorkflowInfo', () => {
  it('fetches with correct URL', async () => {
    mockOk({ runs: [], changelogs: [], configs: [] });
    await fetchWorkflowInfo('2026-03-01');
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/workflow-info?date=2026-03-01');
  });
});

describe('fetchAvailability', () => {
  it('fetches from /api/v1/availability', async () => {
    const data = [
      { model: 'dsr1', isl: 1024, osl: 1024, precision: 'fp8', date: '2026-03-01' },
      { model: 'dsr1', isl: 1024, osl: 1024, precision: 'fp4', date: '2026-02-28' },
    ];
    mockOk(data);
    const result = await fetchAvailability();
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/availability');
    expect(result).toHaveLength(2);
    expect(result[0].model).toBe('dsr1');
  });
});

describe('fetchReliability', () => {
  it('fetches from /api/v1/reliability', async () => {
    mockOk([{ hardware: 'h100', date: '2026-03-01', n_success: 10, total: 10 }]);
    const result = await fetchReliability();
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/reliability');
    expect(result).toHaveLength(1);
    expect(result[0].hardware).toBe('h100');
  });
});

describe('fetchEvaluations', () => {
  it('fetches from /api/v1/evaluations', async () => {
    mockOk([{ task: 'gsm8k', model: 'dsr1' }]);
    const result = await fetchEvaluations();
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/evaluations');
    expect(result[0].task).toBe('gsm8k');
  });
});
