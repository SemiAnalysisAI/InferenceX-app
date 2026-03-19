import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@semianalysisai/inferencex-constants', () => ({
  GITHUB_OWNER: 'TestOwner',
  GITHUB_REPO: 'TestRepo',
}));

import { GET } from './route';

const originalFetch = globalThis.fetch;
let origToken: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  origToken = process.env.GITHUB_TOKEN;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (origToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = origToken;
  }
});

describe('GET /api/v1/github-stars', () => {
  it('returns star count on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stargazers_count: 42000 }),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      owner: 'TestOwner',
      repo: 'TestRepo',
      stars: 42000,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/TestOwner/TestRepo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github.v3+json',
        }),
      }),
    );
  });

  it('returns 502 when GitHub API errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
    });

    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('GitHub API error: 403');
  });

  it('returns 500 when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
