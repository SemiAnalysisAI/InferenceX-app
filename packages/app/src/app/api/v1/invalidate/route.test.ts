import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockPurgeAll } = vi.hoisted(() => ({
  mockPurgeAll: vi.fn(),
}));

vi.mock('@/lib/api-cache', () => ({
  purgeAll: mockPurgeAll,
}));

import { POST } from './route';

let origSecret: string | undefined;
let origVercelEnv: string | undefined;
let origVercelGitCommitRef: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  origSecret = process.env.INVALIDATE_SECRET;
  origVercelEnv = process.env.VERCEL_ENV;
  origVercelGitCommitRef = process.env.VERCEL_GIT_COMMIT_REF;
  process.env.INVALIDATE_SECRET = 'test-secret-123';
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_GIT_COMMIT_REF;
});

afterEach(() => {
  if (origSecret === undefined) {
    delete process.env.INVALIDATE_SECRET;
  } else {
    process.env.INVALIDATE_SECRET = origSecret;
  }
  if (origVercelEnv === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = origVercelEnv;
  }
  if (origVercelGitCommitRef === undefined) {
    delete process.env.VERCEL_GIT_COMMIT_REF;
  } else {
    process.env.VERCEL_GIT_COMMIT_REF = origVercelGitCommitRef;
  }
});

function postReq(headers?: Record<string, string>): Request {
  return new Request('http://localhost/api/v1/invalidate', {
    method: 'POST',
    headers: headers ?? {},
  });
}

describe('POST /api/v1/invalidate', () => {
  it('returns 401 when no auth header', async () => {
    const res = await POST(postReq());
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body).toBe('Unauthorized');
  });

  it('returns 401 when auth header is wrong', async () => {
    const res = await POST(postReq({ Authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when INVALIDATE_SECRET is not set', async () => {
    delete process.env.INVALIDATE_SECRET;

    const res = await POST(postReq({ Authorization: 'Bearer anything' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 for length mismatch (timing-safe)', async () => {
    const res = await POST(postReq({ Authorization: 'Bearer short' }));
    expect(res.status).toBe(401);
  });

  it('allows the Vercel-protected staging branch with an automation bypass', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_REF = 'staging';
    mockPurgeAll.mockResolvedValueOnce(4);

    const res = await POST(postReq({ 'x-vercel-protection-bypass': 'opaque-bypass' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invalidated: true, blobsDeleted: 4 });
    expect(mockPurgeAll).toHaveBeenCalledOnce();
  });

  it('still requires app auth for non-staging preview branches', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_REF = 'feature-branch';

    const res = await POST(postReq({ 'x-vercel-protection-bypass': 'opaque-bypass' }));

    expect(res.status).toBe(401);
    expect(mockPurgeAll).not.toHaveBeenCalled();
  });

  it('still requires app auth when staging has no automation bypass header', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_REF = 'staging';

    const res = await POST(postReq());

    expect(res.status).toBe(401);
    expect(mockPurgeAll).not.toHaveBeenCalled();
  });

  it('invalidates cache with correct auth', async () => {
    mockPurgeAll.mockResolvedValueOnce(15);

    const res = await POST(postReq({ Authorization: 'Bearer test-secret-123' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ invalidated: true, blobsDeleted: 15 });
    expect(mockPurgeAll).toHaveBeenCalledOnce();
  });

  it('returns zero blobs deleted when cache is empty', async () => {
    mockPurgeAll.mockResolvedValueOnce(0);

    const res = await POST(postReq({ Authorization: 'Bearer test-secret-123' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ invalidated: true, blobsDeleted: 0 });
  });
});
