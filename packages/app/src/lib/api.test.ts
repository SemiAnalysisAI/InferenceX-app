import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  fetchBenchmarks,
  fetchWorkflowInfo,
  fetchAvailability,
  deleteCollectiveXRun,
  fetchCollectiveXRun,
  fetchCollectiveXRunList,
  fetchReliability,
  fetchEvaluations,
} from './api';
import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import { makeCollectiveXDataset } from '@/components/collectivex/test-fixture';

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

describe('abort signal', () => {
  it('passes signal to fetch and rejects with AbortError when aborted', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    const promise = fetchBenchmarks('dsr1', undefined, undefined, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow('The operation was aborted.');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

describe('fetchBenchmarks', () => {
  it('fetches with correct URL and params', async () => {
    mockOk([]);
    await fetchBenchmarks('DeepSeek-R1-0528');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/benchmarks?model=DeepSeek-R1-0528',
      expect.objectContaining({}),
    );
  });

  it('includes date param when provided', async () => {
    mockOk([]);
    await fetchBenchmarks('DeepSeek-R1-0528', '2026-02-27');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/benchmarks?model=DeepSeek-R1-0528&date=2026-02-27',
      expect.objectContaining({}),
    );
  });

  it('requests the compact calculator view for one sequence', async () => {
    mockOk([]);
    await fetchBenchmarks(
      'DeepSeek-R1-0528',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        type: 'calculator',
        sequence: 'agentic-traces',
      },
    );
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/benchmarks?model=DeepSeek-R1-0528&view=calculator&sequence=agentic-traces',
      expect.objectContaining({}),
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
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/workflow-info?date=2026-03-01',
      expect.objectContaining({}),
    );
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
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/availability', expect.objectContaining({}));
    expect(result).toHaveLength(2);
    expect(result[0].model).toBe('dsr1');
  });
});

describe('fetchReliability', () => {
  it('fetches from /api/v1/reliability', async () => {
    mockOk([{ hardware: 'h100', date: '2026-03-01', n_success: 10, total: 10 }]);
    const result = await fetchReliability();
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/reliability', expect.objectContaining({}));
    expect(result).toHaveLength(1);
    expect(result[0].hardware).toBe('h100');
  });
});

describe('fetchEvaluations', () => {
  it('fetches from /api/v1/evaluations', async () => {
    mockOk([{ task: 'gsm8k', model: 'dsr1' }]);
    const result = await fetchEvaluations();
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/evaluations', expect.objectContaining({}));
    expect(result[0].task).toBe('gsm8k');
  });
});

describe('CollectiveX API', () => {
  const dataset = makeCollectiveXDataset();

  function mockJson(payload: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(payload),
    });
  }

  it('fetches a specific run by id', async () => {
    mockJson(dataset);

    const result = await fetchCollectiveXRun(1, dataset.run.run_id);

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/collectivex/runs/${dataset.run.run_id}?version=1`,
      expect.objectContaining({}),
    );
    expect(result.run.run_id).toBe(dataset.run.run_id);
  });

  it('fetches the run list', async () => {
    mockJson({ version: 1, runs: [buildRunSummary(dataset)], discovery_complete: true });

    const response = await fetchCollectiveXRunList(1);

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/collectivex/runs?version=1',
      expect.objectContaining({}),
    );
    expect(response.discovery_complete).toBe(true);
    expect(response.runs).toHaveLength(1);
    expect(response.runs[0].run_id).toBe(dataset.run.run_id);
  });

  it('sends the bearer token on delete and reports success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    await expect(deleteCollectiveXRun('160', 'secret-token')).resolves.toBe(true);

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/collectivex/runs/160', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer secret-token' },
    });
  });

  it('resolves false on 401 so callers can clear a stale token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(deleteCollectiveXRun('160', 'stale')).resolves.toBe(false);
  });

  it('throws on non-auth delete failures', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(deleteCollectiveXRun('160', 'secret-token')).rejects.toThrow(/500/);
  });
});
