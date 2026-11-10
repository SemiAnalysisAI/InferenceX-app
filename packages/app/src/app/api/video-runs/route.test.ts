import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeNextCache, resetFakeNextCache } from '@/lib/testing/fake-next-cache';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';
import { GET, POST } from './route';
import { publishedVideoHistory, recordVideoHistory } from '@/lib/video/video-history-store';
import { publishVideoQuality } from '@/lib/video/video-quality';
import {
  approveVideoPublication,
  readStoredArtifact,
  renditionPreviews,
  storedArtifacts,
  storeVideoArtifact,
  videoStorageEnabled,
} from '@/lib/video/video-storage';

vi.mock('next/cache', () => fakeNextCache);
vi.mock('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
vi.mock('@/lib/video/video-storage', () => {
  const readIndex = vi.fn();
  return {
    approveVideoPublication: vi.fn(),
    videoStorageEnabled: vi.fn(() => false),
    storedArtifacts: vi.fn(() => Promise.resolve([])),
    readStoredArtifact: readIndex,
    readPublishedArtifact: vi.fn(async (...args: unknown[]) => ({
      saved: await readIndex(...args),
      complete: true,
    })),
    renditionPreviews: vi.fn(() => Promise.resolve(new Map())),
    storeVideoArtifact: vi.fn(),
  };
});
vi.mock('@/lib/video/video-quality', () => ({
  publishVideoQuality: vi.fn(() => Promise.resolve(null)),
  liveTrustedQuality: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/lib/video/video-history-store', () => ({
  publishedVideoHistory: vi.fn(() =>
    Promise.resolve({ page: { schemaVersion: 1, entries: [], nextPage: null }, complete: true }),
  ),
  recordVideoHistory: vi.fn(() => Promise.resolve({ entries: 1, built: 1, skipped: 0 })),
}));
const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
const response = (body: unknown, status = 200) => Response.json(body, { status });
const clip = (n: number) => `gpu/c1/baseline/artifacts/measurement-r001-c00${n}.mp4`;
const original = (hash: string) => ({
  url: `https://store.test/h3-video-media/v1/objects/${hash}/clip.mp4`,
  downloadUrl: `https://store.test/h3-video-media/v1/objects/${hash}/clip.mp4?download=1`,
});
const request = (query = '') => new NextRequest(`http://localhost/api/video-runs${query}`);
const post = (body: unknown, secret = 'test-secret') =>
  new Request('http://localhost/api/video-runs', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
afterEach(() => {
  resetFakeNextCache();
  fetchMock.mockReset();
  vi.mocked(videoStorageEnabled).mockReturnValue(false);
  vi.mocked(storedArtifacts).mockResolvedValue([]);
  vi.mocked(publishedVideoHistory).mockClear();
  vi.mocked(recordVideoHistory).mockClear();
  vi.mocked(readStoredArtifact).mockReset();
  vi.mocked(storeVideoArtifact).mockClear();
  vi.mocked(approveVideoPublication).mockReset();
  vi.mocked(renditionPreviews).mockReset().mockResolvedValue(new Map());
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('H3 CI artifact access', () => {
  it('keeps metadata-only fixture media reads local instead of falling through to production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_FIXTURES', '1');
    const result = await GET(request('?run=10&artifact=20&format=published'));
    expect(result.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves retained History from the shared cache while GitHub is down', async () => {
    fetchMock.mockRejectedValue(new Error('GitHub unavailable'));
    const first = await GET(request('?format=history'));
    const hit = await GET(request('?format=history'));
    expect(first.status).toBe(200);
    expect(hit.status).toBe(200);
    expect(hit.headers.get('cache-control')).toBe('private, no-store');
    expect(publishedVideoHistory).toHaveBeenCalledTimes(1);
    await GET(request('?format=history&page=1&pages=5'));
    expect(publishedVideoHistory).toHaveBeenLastCalledWith(1, 5);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not retain a failed History read', async () => {
    vi.mocked(publishedVideoHistory).mockRejectedValueOnce(new Error('Unavailable'));
    const failed = await GET(request('?format=history'));
    const retried = await GET(request('?format=history'));
    expect(failed.status).toBe(502);
    expect(retried.status).toBe(200);
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
  });

  it('marks a History page whose index or approval reads failed as incomplete', async () => {
    const page: VideoHistoryPage = { schemaVersion: 1, entries: [], nextPage: null };
    vi.mocked(publishedVideoHistory)
      .mockResolvedValueOnce({ page, complete: false })
      .mockResolvedValueOnce({ page, complete: true });
    const degraded = await GET(request('?format=history&page=1&pages=5'));
    const complete = await GET(request('?format=history&page=1&pages=5'));
    expect(degraded.status).toBe(200);
    expect(degraded.headers.get('x-videogenx-incomplete')).toBe('1');
    expect(complete.headers.get('x-videogenx-incomplete')).toBeNull();
  });

  it('never serves synthetic History approval in production when fixture mode is set', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2E_FIXTURES', '1');
    const result = await GET(request('?format=history&page=1'));
    expect(result.headers.get('x-videogenx-replay')).toBeNull();
    expect(await result.json()).toEqual({ schemaVersion: 1, entries: [], nextPage: null });
    expect(publishedVideoHistory).toHaveBeenCalledWith(1, 1);
  });

  it('serves synthetic History only in development fixture mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_FIXTURES', '1');
    const result = await GET(request('?format=history&page=1'));
    expect(result.headers.get('x-videogenx-replay')).toBe('1');
    const data = await result.json();
    expect(data.entries.length).toBeGreaterThan(0);
  });

  it('discovers old published results without scanning unrelated recent Actions or publishing', async () => {
    const result = await GET(request('?format=history&page=2'));
    expect(await result.json()).toEqual({ schemaVersion: 1, entries: [], nextPage: null });
    expect(publishedVideoHistory).toHaveBeenCalledWith(2, 1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeVideoArtifact).not.toHaveBeenCalled();
    expect(recordVideoHistory).not.toHaveBeenCalled();
  });

  it('reads up to five History pages in one request and rejects any other page count', async () => {
    const result = await GET(request('?format=history&page=1&pages=5'));
    expect(result.status).toBe(200);
    expect(publishedVideoHistory).toHaveBeenCalledWith(1, 5);
    const invalid = await Promise.all(
      [
        '?format=history&pages=6',
        '?format=history&pages=0',
        '?format=history&pages=01',
        '?format=history&pages=x',
        '?page=1&pages=2',
        '?run=10&pages=2',
      ].map((query) => GET(request(query))),
    );
    expect(invalid.map((item) => item.status)).toEqual([400, 400, 400, 400, 400, 400]);
    expect(publishedVideoHistory).toHaveBeenCalledTimes(1);
  });

  it('discovers benchmark runs without including branch-named unit jobs', async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        workflow_runs: [
          { id: 1, name: 'e2e Test - h3-8s', path: '.github/workflows/e2e-tests.yml' },
          { id: 2, name: 'Test H3 Video', path: '.github/workflows/test-h3-video.yml' },
          { id: 3, name: 'H3 Video Smoke', path: '.github/workflows/h3-video.yml' },
          { id: 4, name: 'H3 retained-media fidelity', path: '.github/workflows/h3-fidelity.yml' },
          { id: 5, name: 'InferenceX Sweep', path: '.github/workflows/run-sweep.yml' },
        ],
      }),
    );
    const result = await GET(request());
    const data = await result.json();
    expect(data.runs.map((r: { id: number }) => r.id)).toEqual([1, 3, 4, 5]);
    expect(result.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects unrelated or mismatched artifact identities', async () => {
    fetchMock.mockResolvedValueOnce(response({ name: 'h3-video-11-1', workflow_run: { id: 11 } }));
    const result2 = await GET(request('?run=10&artifact=20'));
    expect(result2.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps expired artifacts explicit', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ name: 'h3-results-10-1', workflow_run: { id: 10 }, expired: true }),
    );
    const result3 = await GET(request('?run=10&artifact=20'));
    expect(result3.status).toBe(410);
  });
  it('streams the verified run artifact with a deadline longer than metadata requests', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const deadline = new AbortController().signal;
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockImplementation((ms) => (ms === 270000 ? deadline : new AbortController().signal));
    fetchMock
      .mockResolvedValueOnce(
        response({
          name: 'h3-results-10-1-h3-sglang-h200-bf16',
          workflow_run: { id: 10 },
          size_in_bytes: 4,
          archive_download_url: 'https://evil.example',
        }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([80, 75, 3, 4])));
    const result = await GET(request('?run=10&artifact=20'));
    expect(timeout).toHaveBeenCalledWith(270000);
    expect(fetchMock.mock.calls[1][1]?.signal).toBe(deadline);
    expect(fetchMock.mock.calls[0][1]?.signal).not.toBe(deadline);
    expect(result.headers.get('content-type')).toBe('application/zip');
    expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([80, 75, 3, 4]);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://api.github.com/repos/SemiAnalysisAI/InferenceX/actions/artifacts/20/zip',
    );
  });
  it('rejects oversized artifacts before downloading', async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        name: 'h3-video-10-1',
        workflow_run: { id: 10 },
        size_in_bytes: 300 * 1024 ** 2,
      }),
    );
    const result4 = await GET(request('?run=10&artifact=20'));
    expect(result4.status).toBe(413);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('shows a run with no result artifact without substituting another run', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ id: 10, conclusion: 'failure' }))
      .mockResolvedValueOnce(response({ artifacts: [{ id: 20, name: 'other-artifact' }] }));
    const result = await GET(request('?run=10'));
    expect(await result.json()).toEqual({
      run: { id: 10, conclusion: 'failure' },
      artifacts: [],
    });
  });
  it('discovers native row artifacts beyond the first run page without duplicating overlapping IDs', async () => {
    const native = { id: 120, name: `h3-results-10-2-${'a'.repeat(64)}` };
    fetchMock
      .mockResolvedValueOnce(response({ id: 10, conclusion: 'failure' }))
      .mockResolvedValueOnce(
        response({
          artifacts: Array.from({ length: 100 }, (_, id) => ({ id, name: 'unrelated' })),
        }),
      )
      .mockResolvedValueOnce(
        response({ artifacts: [native, native, { id: 121, name: 'h3-results-11-1' }] }),
      );
    const result = await GET(request('?run=10'));
    const data = await result.json();
    expect(data.artifacts).toEqual([native]);
    expect(String(fetchMock.mock.calls[2][0])).toContain('artifacts?per_page=100&page=2');
    expect(storeVideoArtifact).not.toHaveBeenCalled();
  });
  it('falls back to the CI ZIP when object storage is not configured', async () => {
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(result.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('serves a persisted result without fetching an expired GitHub artifact', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    const artifact = {
      id: 20,
      name: 'h3-results-10-1',
      expired: false,
      size_in_bytes: 4,
      stored: true,
    };
    const saved = { storageVersion: 1 as const, runId: '10', artifact, sources: [] };
    vi.mocked(storedArtifacts).mockResolvedValue([artifact]);
    vi.mocked(readStoredArtifact).mockResolvedValue(saved);
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(await result.json()).toEqual(saved);
    const repeated = await GET(request('?run=10&artifact=20&format=published'));
    expect(await repeated.json()).toEqual(saved);
    expect(readStoredArtifact).toHaveBeenCalledTimes(1);
  });
  it('adds a web rendition only to clips whose sealed SHA256 has a receipt', async () => {
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    const artifact = { id: 20, name: 'h3-results-10-1', expired: false, size_in_bytes: 4 };
    const [a, b] = ['a'.repeat(64), 'b'.repeat(64)];
    const preview = `https://store.test/h3-video-media/v1/objects/${'e'.repeat(64)}/web-h264-crf23.mp4`;
    const saved = {
      storageVersion: 1 as const,
      runId: '10',
      artifact,
      sources: [
        {
          id: '10',
          documents: [],
          checksums: [
            [clip(1), a],
            [clip(2), b],
          ] as [string, string][],
          assets: [
            [clip(1), original(a)],
            [clip(2), original(b)],
          ] as [string, ReturnType<typeof original>][],
          texts: [],
        },
      ],
    };
    vi.mocked(storedArtifacts).mockResolvedValue([artifact]);
    vi.mocked(readStoredArtifact).mockResolvedValue(saved);
    vi.mocked(renditionPreviews).mockResolvedValue(new Map([[a, preview]]));
    fetchMock.mockImplementation(() => Promise.resolve(response({ private: false })));
    const published = await GET(request('?run=10&artifact=20&format=published'));
    const result = await published.json();
    expect(result.sources[0].assets).toEqual([
      [clip(1), { ...original(a), previewUrl: preview }],
      [clip(2), original(b)],
    ]);

    resetFakeNextCache();
    vi.mocked(renditionPreviews).mockRejectedValue(new Error('Blob list unavailable'));
    const fallback = await GET(request('?run=10&artifact=20&format=published'));
    expect(fallback.status).toBe(200);
    expect(await fallback.json()).toEqual(saved);
  });
  it('retains stored artifacts after GitHub removes them from the run', async () => {
    const artifact = {
      id: 20,
      name: 'h3-results-10-1',
      expired: false,
      size_in_bytes: 0,
      stored: true,
    };
    vi.mocked(storedArtifacts).mockResolvedValue([artifact]);
    fetchMock
      .mockResolvedValueOnce(response({ id: 10, conclusion: 'success' }))
      .mockResolvedValueOnce(response({ artifacts: [] }));
    const result = await GET(request('?run=10'));
    const data = await result.json();
    expect(data.artifacts).toEqual([artifact]);
  });
  it('loads independent run lookups together', async () => {
    let finishRun!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishRun = resolve;
        }),
      )
      .mockResolvedValueOnce(response({ artifacts: [] }));
    const pending = GET(request('?run=10'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain('/actions/runs/10/artifacts');
    finishRun(response({ id: 10 }));
    const result = await pending;
    expect(result.status).toBe(200);
  });
  it('rejects invalid identifiers without making requests', async () => {
    const result5 = await GET(request('?run=../secret'));
    expect(result5.status).toBe(400);
    const result6 = await GET(request('?artifact=123'));
    expect(result6.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('H3 published results in development', () => {
  const saved = {
    storageVersion: 1,
    runId: '10',
    artifact: { id: 20, name: 'h3-fidelity-10-1', stored: true },
    sources: [
      {
        id: '10',
        kind: 'fidelity',
        assets: [['clip.mp4', { url: 'https://cdn.example/clip.mp4' }]],
      },
    ],
  };

  it('reuses the published result without a ZIP download or forwarded credentials', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    fetchMock.mockResolvedValueOnce(response(saved));
    const result = await GET(
      new NextRequest(
        'http://localhost/api/video-runs?run=10&artifact=20&format=media&origin=https://evil.example',
        { headers: { authorization: 'Bearer local-only', cookie: 'session=local-only' } },
      ),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://inferencex.semianalysis.com/api/video-runs?run=10&artifact=20&format=published',
    );
    expect(options).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' });
    expect(options?.headers).toBeUndefined();
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
  });

  it.each([
    ['?run=10', { run: { id: 10 }, artifacts: [saved.artifact] }, '?run=10'],
    ['?page=2', { runs: [{ id: 10 }], nextPage: 3 }, '?page=2'],
    [
      '?format=history&pages=5',
      { schemaVersion: 1, entries: [], nextPage: null },
      '?format=history&page=1&pages=5',
    ],
  ])(
    'reuses published discovery for %s, including retained artifacts',
    async (query, data, upstream) => {
      vi.stubEnv('NODE_ENV', 'development');
      fetchMock.mockResolvedValueOnce(response(data));
      const result = await GET(request(query));
      expect(await result.json()).toEqual(data);
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        `https://inferencex.semianalysis.com/api/video-runs${upstream}`,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps cache misses available for the existing local ZIP fallback', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(result.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
  });

  it.each([
    { ...saved, runId: '11' },
    { ...saved, artifact: { id: 21 } },
    { ...saved, sources: [] },
  ])('rejects a mismatched or incomplete published result', async (data) => {
    vi.stubEnv('NODE_ENV', 'development');
    fetchMock.mockResolvedValueOnce(response(data));
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(result.status).toBe(502);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
  });

  it('refuses an old deployment ZIP response instead of consuming it as stored media', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const zip = new Response('not JSON', { headers: { 'Content-Type': 'application/zip' } });
    const cancel = vi.spyOn(zip.body!, 'cancel');
    fetchMock.mockResolvedValueOnce(zip);
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(result.status).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('preserves the production visibility failure without trying an archive', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    fetchMock.mockResolvedValueOnce(response({ error: 'Public H3 repository unavailable' }, 503));
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(result.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['media', 'published'])(
    'never publishes an uncached artifact through production format=%s',
    async (format) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.mocked(videoStorageEnabled).mockReturnValue(true);
      const result = await GET(request(`?run=10&artifact=20&format=${format}`));
      expect(result.status).toBe(204);
      expect(storedArtifacts).toHaveBeenCalledWith('10');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(storeVideoArtifact).not.toHaveBeenCalled();
    },
  );
});

describe('explicit H3 publication', () => {
  const artifact = {
    id: 20,
    name: `h3-results-10-1-${'a'.repeat(64)}`,
    expired: false,
    size_in_bytes: 4,
    digest: `sha256:${'b'.repeat(64)}`,
    workflow_run: { id: 10, head_sha: 'c'.repeat(40) },
  };
  const saved = { storageVersion: 1 as const, runId: '10', artifact, sources: [{ id: '10' }] };
  const receipt = {
    version: 1,
    runId: '10',
    artifactId: 20,
    artifactName: artifact.name,
    artifactDigest: artifact.digest,
    mergeRunId: '99',
    sources: [{ id: '10', sha256: 'd'.repeat(64), checkoutSha: 'e'.repeat(40) }],
  };
  it('rejects a missing secret or bearer before any external read or write', async () => {
    delete process.env.INVALIDATE_SECRET;
    const missingSecret = await POST(post({ runId: '10', artifactId: '20', mergeRunId: null }));
    expect(missingSecret.status).toBe(500);
    vi.stubEnv('INVALIDATE_SECRET', 'test-secret');
    const unauthorized = await POST(
      post({ runId: '10', artifactId: '20', mergeRunId: null }, 'wrong'),
    );
    expect(unauthorized.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeVideoArtifact).not.toHaveBeenCalled();
    expect(approveVideoPublication).not.toHaveBeenCalled();
  });

  it('rejects missing or malformed source, artifact and merge identities before external reads', async () => {
    vi.stubEnv('INVALIDATE_SECRET', 'test-secret');
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    for (const body of [
      { artifactId: '20', mergeRunId: null },
      { runId: '10', artifactId: '../20', mergeRunId: null },
      { runId: '10', artifactId: '9007199254740993', mergeRunId: null },
      { runId: '10', artifactId: '20' },
      { runId: '10', artifactId: '20', mergeRunId: '0' },
    ]) {
      const result = await POST(post(body));
      expect(result.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeVideoArtifact).not.toHaveBeenCalled();
  });

  it('binds an authorized POST to exact run, artifact and merge identities', async () => {
    vi.stubEnv('INVALIDATE_SECRET', 'test-secret');
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    vi.mocked(readStoredArtifact).mockResolvedValue(saved as never);
    vi.mocked(approveVideoPublication).mockResolvedValue(receipt as never);
    vi.mocked(publishVideoQuality).mockResolvedValueOnce({ pairs: [{}, {}] } as never);
    await GET(request('?format=history'));
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(response(artifact));
    const result = await POST(post({ runId: '10', artifactId: '20', mergeRunId: '99' }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ...receipt, quality: 2 });
    expect(readStoredArtifact).toHaveBeenCalledWith('10', artifact);
    expect(approveVideoPublication).toHaveBeenCalledWith(
      '10',
      artifact,
      saved,
      '99',
      expect.any(AbortSignal),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
    await GET(request('?format=history'));
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
    expect(recordVideoHistory).toHaveBeenCalledExactlyOnceWith(saved);
    expect(vi.mocked(recordVideoHistory).mock.invocationCallOrder[0]).toBeGreaterThan(
      vi.mocked(approveVideoPublication).mock.invocationCallOrder[0],
    );
  });

  it('publishes a run whose quality is missing or cannot be attached', async () => {
    vi.stubEnv('INVALIDATE_SECRET', 'test-secret');
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    vi.mocked(readStoredArtifact).mockResolvedValue(saved as never);
    vi.mocked(approveVideoPublication).mockResolvedValue(receipt as never);
    vi.mocked(publishVideoQuality).mockRejectedValueOnce(new Error('quality listing failed'));
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(response(artifact));
    const result = await POST(post({ runId: '10', artifactId: '20', mergeRunId: '99' }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ...receipt, quality: 'failed' });
    expect(recordVideoHistory).toHaveBeenCalledExactlyOnceWith(saved);
  });

  it('reports a publication whose History entry was not recorded as failed and still drops cached History', async () => {
    vi.stubEnv('INVALIDATE_SECRET', 'test-secret');
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    vi.mocked(readStoredArtifact).mockResolvedValue(saved as never);
    vi.mocked(approveVideoPublication).mockResolvedValue(receipt as never);
    vi.mocked(recordVideoHistory).mockRejectedValueOnce(new Error('snapshot write failed'));
    await GET(request('?format=history'));
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(response(artifact));
    const result = await POST(post({ runId: '10', artifactId: '20', mergeRunId: '99' }));
    expect(result.status).toBe(502);
    // The approval receipt was written, so History projected before it is stale.
    await GET(request('?format=history'));
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
  });

  it('backfills History only for an authorized exact backfill request', async () => {
    vi.stubEnv('INVALIDATE_SECRET', 'test-secret');
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    const unauthorized = await POST(post({ history: 'backfill' }, 'wrong'));
    expect(unauthorized.status).toBe(401);
    const rejected = await Promise.all(
      [{ history: 'backfill', runId: '10' }, { history: 'rebuild' }].map((body) =>
        POST(post(body)),
      ),
    );
    expect(rejected.map((item) => item.status)).toEqual([400, 400]);
    expect(recordVideoHistory).not.toHaveBeenCalled();
    const result = await POST(post({ history: 'backfill' }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ entries: 1, built: 1, skipped: 0 });
    expect(recordVideoHistory).toHaveBeenCalledExactlyOnceWith(null);
    vi.mocked(recordVideoHistory).mockRejectedValueOnce(new Error('list failed'));
    const failed = await POST(post({ history: 'backfill' }));
    expect(failed.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(approveVideoPublication).not.toHaveBeenCalled();
  });

  it('downloads only the named artifact on an authorized cold publication', async () => {
    vi.stubEnv('INVALIDATE_SECRET', 'test-secret');
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    vi.mocked(readStoredArtifact)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(saved as never);
    vi.mocked(approveVideoPublication).mockResolvedValue(receipt as never);
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(response(artifact))
      .mockResolvedValueOnce(new Response(new Uint8Array([80, 75, 3, 4])));
    const result = await POST(post({ runId: '10', artifactId: '20', mergeRunId: '99' }));
    expect(result.status).toBe(200);
    expect(storeVideoArtifact).toHaveBeenCalledWith(
      '10',
      artifact,
      expect.any(Blob),
      expect.any(AbortSignal),
    );
    expect(String(fetchMock.mock.calls[2][0])).toContain('/actions/artifacts/20/zip');
  });

  it('rejects a different source before downloading or approving anything', async () => {
    vi.stubEnv('INVALIDATE_SECRET', 'test-secret');
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(response({ ...artifact, workflow_run: { id: 11 } }));
    const result = await POST(post({ runId: '10', artifactId: '20', mergeRunId: '99' }));
    expect(result.status).toBe(404);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
    expect(approveVideoPublication).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps an existing index readable if approval storage fails', async () => {
    vi.stubEnv('INVALIDATE_SECRET', 'test-secret');
    vi.mocked(videoStorageEnabled).mockReturnValue(true);
    vi.mocked(readStoredArtifact).mockResolvedValue(saved as never);
    vi.mocked(storedArtifacts).mockResolvedValue([artifact]);
    vi.mocked(approveVideoPublication).mockRejectedValue(new Error('approval storage failed'));
    fetchMock
      .mockResolvedValueOnce(response({ private: false }))
      .mockResolvedValueOnce(response(artifact))
      .mockResolvedValueOnce(response({ private: false }));
    const failed = await POST(post({ runId: '10', artifactId: '20', mergeRunId: '99' }));
    expect(failed.status).toBe(502);
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(await result.json()).toEqual(saved);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
  });
});
