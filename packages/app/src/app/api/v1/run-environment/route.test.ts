import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockGetEnvironment, mockGetDb } = vi.hoisted(() => ({
  mockGetEnvironment: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  JSON_MODE: false,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/environments', () => ({
  getEnvironmentForRunConfig: mockGetEnvironment,
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

const env = {
  source: 'env_json' as const,
  image: 'lmsysorg/sglang:latest',
  framework_version: '0.4.3.post2',
  framework_sha: 'e136d70cdc6101007017c05d57fb4cec5d6ed98f',
  torch_version: '2.5.1+cu124',
  python_version: '3.12.7',
  cuda_version: '12.4',
  rocm_version: null,
  driver_version: '560.35.03',
  gpu_sku: 'NVIDIA H100 80GB HBM3',
  extra: {},
};

const VALID_QS = 'workflow_run_id=101&config_id=42';

describe('GET /api/v1/run-environment', () => {
  it('returns 400 when workflow_run_id is missing', async () => {
    const res = await GET(req('/api/v1/run-environment?config_id=42'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when config_id is missing', async () => {
    const res = await GET(req('/api/v1/run-environment?workflow_run_id=101'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when params are non-numeric', async () => {
    const res = await GET(req('/api/v1/run-environment?workflow_run_id=abc&config_id=xyz'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no environment row exists', async () => {
    mockGetEnvironment.mockResolvedValueOnce(null);
    const res = await GET(req(`/api/v1/run-environment?${VALID_QS}`));
    expect(res.status).toBe(404);
  });

  it('returns env_json environment for valid (workflow_run_id, config_id)', async () => {
    mockGetEnvironment.mockResolvedValueOnce(env);
    const res = await GET(req(`/api/v1/run-environment?${VALID_QS}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ workflow_run_id: 101, config_id: 42, environment: env });
    expect(mockGetEnvironment).toHaveBeenCalledWith('mock-sql', 101, 42);
  });

  it('returns log_parse environment with nulls preserved', async () => {
    mockGetEnvironment.mockResolvedValueOnce({
      ...env,
      source: 'log_parse',
      framework_sha: null,
      driver_version: null,
      cuda_version: null,
      gpu_sku: null,
    });
    const res = await GET(req(`/api/v1/run-environment?${VALID_QS}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.environment.source).toBe('log_parse');
    expect(body.environment.framework_sha).toBeNull();
    expect(body.environment.driver_version).toBeNull();
  });

  it('returns 500 when query throws', async () => {
    mockGetEnvironment.mockRejectedValueOnce(new Error('Connection reset'));
    const res = await GET(req(`/api/v1/run-environment?${VALID_QS}`));
    expect(res.status).toBe(500);
  });
});

// Separate suite because FIXTURES_MODE is read at module-eval time — the only
// way to flip it for a single test is to reset module cache + dynamic-import.
describe('GET /api/v1/run-environment (FIXTURES_MODE)', () => {
  it('short-circuits to the loaded fixture and never hits the env query', async () => {
    vi.resetModules();
    const mockLoadFixture = vi.fn(() => ({
      workflow_run_id: 1,
      config_id: 1,
      environment: { ...env, source: 'log_parse' },
    }));
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({
      getDb: mockGetDb,
      JSON_MODE: false,
      FIXTURES_MODE: true,
    }));
    vi.doMock('@semianalysisai/inferencex-db/queries/environments', () => ({
      getEnvironmentForRunConfig: mockGetEnvironment,
    }));
    vi.doMock('@/lib/api-cache', () => ({
      cachedQuery: (fn: (...args: any[]) => any) => fn,
      cachedJson: (data: unknown) => Response.json(data),
    }));
    vi.doMock('@/lib/test-fixtures', () => ({ loadFixture: mockLoadFixture }));

    const { GET: GETwithFixtures } = await import('./route');
    const res = await GETwithFixtures(req(`/api/v1/run-environment?${VALID_QS}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.environment.source).toBe('log_parse');
    expect(mockLoadFixture).toHaveBeenCalledWith('run-environment');
    expect(mockGetEnvironment).not.toHaveBeenCalled();
  });

  it('still 400s on missing params before consulting the fixture', async () => {
    vi.resetModules();
    const mockLoadFixture = vi.fn();
    vi.doMock('@semianalysisai/inferencex-db/connection', () => ({
      getDb: mockGetDb,
      JSON_MODE: false,
      FIXTURES_MODE: true,
    }));
    vi.doMock('@semianalysisai/inferencex-db/queries/environments', () => ({
      getEnvironmentForRunConfig: mockGetEnvironment,
    }));
    vi.doMock('@/lib/api-cache', () => ({
      cachedQuery: (fn: (...args: any[]) => any) => fn,
      cachedJson: (data: unknown) => Response.json(data),
    }));
    vi.doMock('@/lib/test-fixtures', () => ({ loadFixture: mockLoadFixture }));

    const { GET: GETwithFixtures } = await import('./route');
    const res = await GETwithFixtures(req('/api/v1/run-environment?config_id=42'));

    expect(res.status).toBe(400);
    expect(mockLoadFixture).not.toHaveBeenCalled();
  });
});
