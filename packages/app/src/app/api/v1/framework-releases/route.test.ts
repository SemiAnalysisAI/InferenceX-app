import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const release = (tag_name: string, published_at: string, extra = {}) => ({
  tag_name,
  published_at,
  prerelease: false,
  draft: false,
  ...extra,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('framework releases', () => {
  it('returns the highest stable version with its publish date, not the newest listing', async () => {
    const lists: Record<string, unknown[]> = {
      vllm: [
        release('v0.31.2', '2026-10-12T00:00:00Z'),
        release('v0.33.0rc1', '2026-10-11T00:00:00Z', { prerelease: true }),
        release('v0.34.0', '2026-10-13T00:00:00Z', { draft: true }),
        release('v0.32.0', '2026-10-01T00:00:00Z'),
        release('nightly', '2026-10-14T00:00:00Z'),
      ],
      sglang: [
        release('v0.5.21.post1', '2026-10-15T00:00:00Z'),
        release('v0.5.22', '2026-10-10T00:00:00Z'),
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Response.json(lists[url.includes('vllm-project') ? 'vllm' : 'sglang']),
      ),
    );
    const response = await GET();
    const body = await response.json();
    expect(body).toEqual({
      vllm: { tag: 'v0.32.0', publishedAt: '2026-10-01T00:00:00Z' },
      sglang: { tag: 'v0.5.22', publishedAt: '2026-10-10T00:00:00Z' },
    });
  });

  it('returns null for a failed lookup or no stable versioned release', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('vllm-project')
          ? new Response('rate limited', { status: 403 })
          : Response.json([release('v0.6.0rc1', '2026-10-01T00:00:00Z', { prerelease: true })]),
      ),
    );
    const response = await GET();
    expect(await response.json()).toEqual({ vllm: null, sglang: null });
  });
});
