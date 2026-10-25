import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ images: vi.fn() }));
vi.mock('@/app/api/v1/latest-images/route', () => ({ GET: mocks.images }));

const release = (tag_name: string, published_at: string, extra = {}) => ({
  tag_name,
  published_at,
  prerelease: false,
  draft: false,
  ...extra,
});
const image = (framework: string, tag: string, model = 'dsv4') => ({
  model,
  hardware: 'b200',
  framework,
  precision: 'fp4',
  spec_method: 'mtp',
  disagg: false,
  isl: null,
  osl: null,
  benchmark_type: 'agentic_traces',
  image: tag,
  date: '2026-10-20',
});

beforeEach(() => {
  mocks.images.mockImplementation(() => Response.json([]));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('framework releases', () => {
  it('returns the highest stable engine version with its publish date', async () => {
    const lists: Record<string, unknown[]> = {
      vllm: [
        release('v0.31.2', '2026-10-12T00:00:00Z'),
        release('v0.33.0rc1', '2026-10-11T00:00:00Z', { prerelease: true }),
        release('v0.34.0', '2026-10-13T00:00:00Z', { draft: true }),
        release('v0.32.0', '2026-10-01T00:00:00Z'),
        release('nightly', '2026-10-14T00:00:00Z'),
      ],
      sglang: [
        release('gateway-v0.9.0', '2026-10-16T00:00:00Z'),
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
    expect(await response.json()).toEqual({
      vllm: { tag: 'v0.32.0', publishedAt: '2026-10-01T00:00:00Z', commits: {} },
      sglang: { tag: 'v0.5.22', publishedAt: '2026-10-10T00:00:00Z', commits: {} },
    });
  });

  it('resolves each active nightly commit against its base engine release', async () => {
    mocks.images.mockImplementation(() =>
      Response.json([
        image('vllm', 'vllm/vllm-openai:nightly-aaaa111@sha256:1'),
        image('dynamo-vllm', 'vllm/vllm-openai:nightly-aaaa111'),
        image('vllm', 'vllm/vllm-openai:nightly-bbbb222'),
        image('vllm', 'vllm/vllm-openai:nightly-cccc333'),
        image('vllm', 'vllm/vllm-openai:nightly-dddd444', 'llama70b'),
        image('vllm', 'vllm/vllm-openai:v0.31.0'),
        image('sglang', 'lmsysorg/sglang:nightly-dev-20261001-eeee555'),
      ]),
    );
    const compare: Record<string, Response | object> = {
      'vllm-project/vllm/compare/v0.32.0...aaaa111': { status: 'behind' },
      'vllm-project/vllm/compare/v0.32.0...bbbb222': { status: 'diverged' },
      'sgl-project/sglang/compare/v0.5.22...eeee555': { status: 'ahead' },
    };
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/releases'))
          return Response.json([
            release(url.includes('vllm-project') ? 'v0.32.0' : 'v0.5.22', '2026-10-01T00:00:00Z'),
          ]);
        const key = url.slice('https://api.github.com/repos/'.length).split('?')[0];
        calls.push(key);
        return compare[key]
          ? Response.json(compare[key])
          : Response.json({ message: 'Not Found' }, { status: 404 });
      }),
    );
    const response = await GET();
    const body = await response.json();
    expect(body.vllm.commits).toEqual({ aaaa111: 'behind', bbbb222: 'diverged' });
    expect(body.sglang.commits).toEqual({ eeee555: 'ahead' });
    expect(calls.toSorted()).toEqual([
      'sgl-project/sglang/compare/v0.5.22...eeee555',
      'vllm-project/vllm/compare/v0.32.0...aaaa111',
      'vllm-project/vllm/compare/v0.32.0...bbbb222',
      'vllm-project/vllm/compare/v0.32.0...cccc333',
    ]);
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
