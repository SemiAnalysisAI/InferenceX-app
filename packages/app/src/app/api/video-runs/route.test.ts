import { strToU8, zipSync } from 'fflate';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi, mock } from 'bun:test';
import { mocked, stubEnv, stubGlobal, unstubAllEnvs, waitFor } from '@/test/helpers';
import { fakeNextCache, resetFakeNextCache } from '@/lib/testing/fake-next-cache';
import type { VideoHistoryPage } from '@/components/video-benchmark/history';

mock.module('next/cache', () => fakeNextCache);
mock.module('@semianalysisai/inferencex-db/connection', () => ({ FIXTURES_MODE: false }));
// video-replay links the local replay readers eagerly, so the real module supplies them. They run
// only when a local replay manifest is configured, which no test does.
const actualQuality = { ...(await import('@/lib/video/video-quality')) };
mock.module('@/lib/video/video-storage', () => {
  const readIndex = vi.fn();
  return {
    approveVideoPublication: vi.fn(),
    readVideoPublication: vi.fn(),
    requireSelectedSource: vi.fn(),
    videoStorageEnabled: vi.fn(() => false),
    storedArtifacts: vi.fn(() => Promise.resolve([])),
    readStoredArtifact: readIndex,
    readPublishedArtifact: vi.fn(async (...args: unknown[]) => ({
      saved: await readIndex(...args),
      complete: true,
    })),
    derivedMedia: vi.fn(() => Promise.resolve(new Map())),
    storeVideoArtifact: vi.fn(),
  };
});
mock.module('@/lib/video/video-quality', () => ({
  ...actualQuality,
  publishVideoQuality: vi.fn(() => Promise.resolve(null)),
  liveTrustedQuality: vi.fn(() => Promise.resolve(null)),
}));
mock.module('@/lib/video/video-history-store', () => ({
  publishedVideoHistory: vi.fn(() =>
    Promise.resolve({ page: { schemaVersion: 1, entries: [], nextPage: null }, complete: true }),
  ),
  recordVideoHistory: vi.fn(() => Promise.resolve({ entries: 1, built: 1, skipped: 0 })),
}));

// Imported after mock.module so the route's read cache is built on the fake next/cache.
const { GET, POST } = await import('./route');
const { publishedVideoHistory, recordVideoHistory } =
  await import('@/lib/video/video-history-store');
const { publishVideoQuality } = await import('@/lib/video/video-quality');
const {
  approveVideoPublication,
  readStoredArtifact,
  readVideoPublication,
  requireSelectedSource,
  derivedMedia,
  storedArtifacts,
  storeVideoArtifact,
  videoStorageEnabled,
} = await import('@/lib/video/video-storage');

const fetchMock = vi.fn<typeof fetch>();
stubGlobal('fetch', fetchMock);
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
  mocked(videoStorageEnabled).mockReturnValue(false);
  mocked(storedArtifacts).mockResolvedValue([]);
  mocked(publishedVideoHistory).mockClear();
  mocked(recordVideoHistory).mockClear();
  mocked(readStoredArtifact).mockReset();
  mocked(storeVideoArtifact).mockClear();
  mocked(approveVideoPublication).mockReset();
  mocked(readVideoPublication).mockReset();
  mocked(requireSelectedSource).mockReset();
  mocked(derivedMedia).mockReset().mockResolvedValue(new Map());
  unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('H3 CI artifact access', () => {
  it('keeps metadata-only fixture media reads local instead of falling through to production', async () => {
    stubEnv('NODE_ENV', 'development');
    stubEnv('E2E_FIXTURES', '1');
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
    mocked(publishedVideoHistory).mockRejectedValueOnce(new Error('Unavailable'));
    const failed = await GET(request('?format=history'));
    const retried = await GET(request('?format=history'));
    expect(failed.status).toBe(502);
    expect(retried.status).toBe(200);
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
  });

  it('marks a History page whose index or approval reads failed as incomplete', async () => {
    const page: VideoHistoryPage = { schemaVersion: 1, entries: [], nextPage: null };
    mocked(publishedVideoHistory)
      .mockResolvedValueOnce({ page, complete: false })
      .mockResolvedValueOnce({ page, complete: true });
    const degraded = await GET(request('?format=history&page=1&pages=5'));
    const complete = await GET(request('?format=history&page=1&pages=5'));
    expect(degraded.status).toBe(200);
    expect(degraded.headers.get('x-videogenx-incomplete')).toBe('1');
    expect(complete.headers.get('x-videogenx-incomplete')).toBeNull();
  });

  it('never serves synthetic History approval in production when fixture mode is set', async () => {
    stubEnv('NODE_ENV', 'production');
    stubEnv('E2E_FIXTURES', '1');
    const result = await GET(request('?format=history&page=1'));
    expect(result.headers.get('x-videogenx-replay')).toBeNull();
    expect(await result.json()).toEqual({ schemaVersion: 1, entries: [], nextPage: null });
    expect(publishedVideoHistory).toHaveBeenCalledWith(1, 1);
  });

  it('serves synthetic History only in development fixture mode', async () => {
    stubEnv('NODE_ENV', 'development');
    stubEnv('E2E_FIXTURES', '1');
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
    stubEnv('NODE_ENV', 'development');
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
    stubEnv('NODE_ENV', 'development');
    mocked(videoStorageEnabled).mockReturnValue(true);
    const artifact = {
      id: 20,
      name: 'h3-results-10-1',
      expired: false,
      size_in_bytes: 4,
      stored: true,
    };
    const saved = { storageVersion: 1 as const, runId: '10', artifact, sources: [] };
    mocked(storedArtifacts).mockResolvedValue([artifact]);
    mocked(readStoredArtifact).mockResolvedValue(saved);
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(await result.json()).toEqual(saved);
    const repeated = await GET(request('?run=10&artifact=20&format=published'));
    expect(await repeated.json()).toEqual(saved);
    expect(readStoredArtifact).toHaveBeenCalledTimes(1);
  });
  it('adds a web rendition and poster only to clips whose sealed SHA256 has a receipt', async () => {
    mocked(videoStorageEnabled).mockReturnValue(true);
    const artifact = { id: 20, name: 'h3-results-10-1', expired: false, size_in_bytes: 4 };
    const [a, b] = ['a'.repeat(64), 'b'.repeat(64)];
    const preview = `https://store.test/h3-video-media/v1/objects/${'e'.repeat(64)}/web-h264-crf23.mp4`;
    const poster = `https://store.test/h3-video-media/v1/objects/${'f'.repeat(64)}/poster-f0-w672-q4.jpg`;
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
    mocked(storedArtifacts).mockResolvedValue([artifact]);
    mocked(readStoredArtifact).mockResolvedValue(saved);
    mocked(derivedMedia).mockResolvedValue(
      new Map([[a, { previewUrl: preview, posterUrl: poster }]]),
    );
    fetchMock.mockImplementation(() => Promise.resolve(response({ private: false })));
    const published = await GET(request('?run=10&artifact=20&format=published'));
    const result = await published.json();
    expect(result.sources[0].assets).toEqual([
      [clip(1), { ...original(a), previewUrl: preview, posterUrl: poster }],
      // No receipt: neither field appears.
      [clip(2), original(b)],
    ]);

    resetFakeNextCache();
    mocked(derivedMedia).mockRejectedValue(new Error('Blob list unavailable'));
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
    mocked(storedArtifacts).mockResolvedValue([artifact]);
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
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
    stubEnv('NODE_ENV', 'development');
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
      stubEnv('NODE_ENV', 'development');
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
    stubEnv('NODE_ENV', 'development');
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
    stubEnv('NODE_ENV', 'development');
    fetchMock.mockResolvedValueOnce(response(data));
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(result.status).toBe(502);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
  });

  it('refuses an old deployment ZIP response instead of consuming it as stored media', async () => {
    stubEnv('NODE_ENV', 'development');
    const zip = new Response('not JSON', { headers: { 'Content-Type': 'application/zip' } });
    const cancel = vi.spyOn(zip.body!, 'cancel');
    fetchMock.mockResolvedValueOnce(zip);
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(result.status).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('preserves the production visibility failure without trying an archive', async () => {
    stubEnv('NODE_ENV', 'development');
    fetchMock.mockResolvedValueOnce(response({ error: 'Public H3 repository unavailable' }, 503));
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(result.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['media', 'published'])(
    'never publishes an uncached artifact through production format=%s',
    async (format) => {
      stubEnv('NODE_ENV', 'production');
      mocked(videoStorageEnabled).mockReturnValue(true);
      const result = await GET(request(`?run=10&artifact=20&format=${format}`));
      expect(result.status).toBe(204);
      expect(storedArtifacts).toHaveBeenCalledWith('10');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(storeVideoArtifact).not.toHaveBeenCalled();
    },
  );
});

const republish = () => POST(post({ runId: '10', artifactId: '20', mergeRunId: null }));

describe('explicit H3 publication', () => {
  const artifact = {
    id: 20,
    name: `h3-results-10-1-${'a'.repeat(64)}`,
    expired: false,
    size_in_bytes: 4,
    digest: `sha256:${'b'.repeat(64)}`,
    workflow_run: { id: 10, head_sha: 'c'.repeat(40) },
  };
  const unselected = { ...artifact, id: 21, name: `h3-results-10-1-${'e'.repeat(64)}` };
  const saved = { storageVersion: 1 as const, runId: '10', artifact, sources: [{ id: '10' }] };
  const selected = { manifestSha256: 'd'.repeat(64), sha256sumsSha256: 'f'.repeat(64) };
  const entry = (name: string) => ({
    name,
    manifest_sha256: selected.manifestSha256,
    sha256sums_sha256: selected.sha256sumsSha256,
  });
  const mergeBody = { runId: '10', mergeRunId: '99', artifactId: '20' };
  const receipt = {
    version: 2,
    runId: '10',
    artifactId: 20,
    artifactName: artifact.name,
    artifactDigest: artifact.digest,
    mergeRunId: '99',
    selected,
    sources: [{ id: '10', sha256: 'd'.repeat(64), checkoutSha: 'e'.repeat(40) }],
  };
  const repository = { full_name: 'SemiAnalysisAI/InferenceX', private: false };
  /**
   * GitHub as a merge approval reads it: source run 10 with both artifacts, Merge Ingest run 99
   * still in progress on main, and its one selection artifact, which names artifact 20.
   */
  function mockGithub({ run = {}, selection = {} }: { run?: object; selection?: object } = {}) {
    const zip = zipSync({
      'video-publication-selection.json': strToU8(
        JSON.stringify({
          version: 1,
          source_run_id: '10',
          artifacts: [entry(artifact.name)],
          ...selection,
        }),
      ),
    });
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url === 'https://storage.test/selection.zip') {
        const range = /^bytes=(?<start>\d+)-(?<end>\d+)$/u.exec(
          new Headers(init?.headers).get('range')!,
        )!.groups!;
        const [start, end] = [Number(range.start), Number(range.end)];
        return Promise.resolve(
          new Response(zip.slice(start, end + 1), {
            status: 206,
            headers: { 'Content-Range': `bytes ${start}-${end}/${zip.length}` },
          }),
        );
      }
      const path = url.replace('https://api.github.com/repos/SemiAnalysisAI/InferenceX', '');
      if (path === '/actions/artifacts/7/zip')
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: 'https://storage.test/selection.zip' },
          }),
        );
      if (path === '/actions/artifacts/20/zip')
        return Promise.resolve(new Response(new Uint8Array([80, 75, 3, 4])));
      const answers: Record<string, object> = {
        '/actions/runs/10/artifacts?per_page=100': { artifacts: [artifact, unselected] },
        '/actions/runs/99': {
          path: '.github/workflows/merge-ingest.yml',
          event: 'push',
          head_branch: 'main',
          head_sha: 'c'.repeat(40),
          status: 'in_progress',
          conclusion: null,
          repository,
          head_repository: repository,
          ...run,
        },
        [`/compare/${'c'.repeat(40)}...main`]: { status: 'identical' },
        '/actions/runs/99/artifacts?name=video-publication-selection&per_page=100': {
          artifacts: [
            {
              id: 7,
              name: 'video-publication-selection',
              expired: false,
              size_in_bytes: zip.length,
            },
          ],
        },
      };
      if (!(path in answers)) throw new Error(`Unexpected GitHub read: ${path}`);
      return Promise.resolve(response(answers[path]));
    });
  }
  it('rejects a missing secret or bearer before any external read or write', async () => {
    delete process.env.INVALIDATE_SECRET;
    const missingSecret = await POST(post({ runId: '10', artifactId: '20', mergeRunId: null }));
    expect(missingSecret.status).toBe(500);
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    const unauthorized = await POST(
      post({ runId: '10', artifactId: '20', mergeRunId: null }, 'wrong'),
    );
    expect(unauthorized.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeVideoArtifact).not.toHaveBeenCalled();
    expect(approveVideoPublication).not.toHaveBeenCalled();
  });

  it('rejects missing or malformed source, artifact and merge identities before external reads', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    for (const body of [
      { artifactId: '20', mergeRunId: null },
      { runId: '10', artifactId: '../20', mergeRunId: null },
      { runId: '10', artifactId: '9007199254740993', mergeRunId: null },
      { runId: '10', artifactId: '20' },
      { runId: '10', artifactId: '20', mergeRunId: '0' },
      { runId: '10', mergeRunId: '99' },
    ]) {
      const result = await POST(post(body));
      expect(result.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storeVideoArtifact).not.toHaveBeenCalled();
  });

  it('approves from an in-progress Merge Ingest run whose selection lists the artifact', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    mocked(readStoredArtifact).mockResolvedValue(saved as never);
    mocked(approveVideoPublication).mockResolvedValue(receipt as never);
    mocked(publishVideoQuality).mockResolvedValueOnce({ pairs: [{}, {}] } as never);
    await GET(request('?format=history'));
    mockGithub();
    const result = await POST(post(mergeBody));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ...receipt, quality: 2 });
    expect(readStoredArtifact).toHaveBeenCalledWith('10', artifact);
    // The digests come from the selection the merge run uploaded; the request carries none.
    expect(approveVideoPublication).toHaveBeenCalledWith(
      saved,
      '99',
      { artifact, ...selected },
      expect.any(AbortSignal),
    );
    expect(storeVideoArtifact).not.toHaveBeenCalled();
    await GET(request('?format=history'));
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
    expect(recordVideoHistory).toHaveBeenCalledExactlyOnceWith(saved, receipt);
    expect(mocked(recordVideoHistory).mock.invocationCallOrder[0]).toBeGreaterThan(
      mocked(approveVideoPublication).mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['a pull_request run', { run: { event: 'pull_request' } }, 403],
    ["another workflow's run", { run: { path: '.github/workflows/run-sweep.yml' } }, 403],
    ['a failed run', { run: { status: 'completed', conclusion: 'failure' } }, 403],
    ['a cancelled run', { run: { status: 'completed', conclusion: 'cancelled' } }, 403],
    ['a selection made for another source run', { selection: { source_run_id: '11' } }, 403],
    [
      'a selection that does not list the artifact',
      { selection: { artifacts: [entry(unselected.name)] } },
      409,
    ],
  ])('does not approve from %s', async (_, github, status) => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    mocked(readStoredArtifact).mockResolvedValue(saved as never);
    mocked(approveVideoPublication).mockResolvedValue(receipt as never);
    mockGithub(github);
    const result = await POST(post(mergeBody));
    expect(result.status).toBe(status);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
    expect(approveVideoPublication).not.toHaveBeenCalled();
    expect(recordVideoHistory).not.toHaveBeenCalled();
  });

  it('does not approve an already stored artifact whose copy differs from the selection', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    mocked(readStoredArtifact).mockResolvedValue(saved as never);
    mocked(requireSelectedSource).mockImplementation(() => {
      throw new Error('Stored source differs from the merge selection');
    });
    mockGithub();
    const result = await POST(post(mergeBody));
    expect(result.status).toBe(502);
    expect(requireSelectedSource).toHaveBeenCalledWith(saved, { artifact, ...selected });
    expect(approveVideoPublication).not.toHaveBeenCalled();
    expect(recordVideoHistory).not.toHaveBeenCalled();
  });

  it('republishes without a merge run only an artifact that already holds an approval', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    // Never stored, then stored without a receipt: refused, and nothing is downloaded or written.
    const neverStored = await republish();
    mocked(storedArtifacts).mockResolvedValue([artifact]);
    mocked(readStoredArtifact).mockResolvedValue(saved as never);
    mocked(readVideoPublication).mockResolvedValueOnce(null);
    for (const refused of [neverStored, await republish()]) {
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual({ error: 'Artifact has no approval to republish' });
    }
    expect(recordVideoHistory).not.toHaveBeenCalled();
    mocked(readVideoPublication).mockResolvedValue(receipt as never);
    const result = await republish();
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ...receipt, quality: null });
    expect(recordVideoHistory).toHaveBeenCalledExactlyOnceWith(saved, receipt);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
    expect(approveVideoPublication).not.toHaveBeenCalled();
  });

  it('republishes a stored artifact whose GitHub copy expired', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    mocked(storedArtifacts).mockResolvedValue([artifact]);
    mocked(readStoredArtifact).mockResolvedValue(saved as never);
    mocked(readVideoPublication).mockResolvedValue(receipt as never);
    fetchMock.mockImplementation((url) =>
      Promise.resolve(
        response(
          String(url).endsWith('/actions/artifacts/20')
            ? { ...artifact, expired: true }
            : { private: false },
        ),
      ),
    );
    const result = await republish();
    expect(result.status).toBe(200);
    expect(recordVideoHistory).toHaveBeenCalledExactlyOnceWith(saved, receipt);
  });

  it('publishes a run whose quality is missing or cannot be attached', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    mocked(readStoredArtifact).mockResolvedValue(saved as never);
    mocked(approveVideoPublication).mockResolvedValue(receipt as never);
    mocked(publishVideoQuality).mockRejectedValueOnce(new Error('quality listing failed'));
    mockGithub();
    const result = await POST(post(mergeBody));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ...receipt, quality: 'failed' });
    expect(recordVideoHistory).toHaveBeenCalledExactlyOnceWith(saved, receipt);
  });

  it('reports a publication whose History entry was not recorded as failed and still drops cached History', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    mocked(readStoredArtifact).mockResolvedValue(saved as never);
    mocked(approveVideoPublication).mockResolvedValue(receipt as never);
    mocked(recordVideoHistory).mockRejectedValueOnce(new Error('snapshot write failed'));
    await GET(request('?format=history'));
    mockGithub();
    const result = await POST(post(mergeBody));
    expect(result.status).toBe(502);
    // The approval receipt was written, so History projected before it is stale.
    await GET(request('?format=history'));
    expect(publishedVideoHistory).toHaveBeenCalledTimes(2);
  });

  it('backfills History only for an authorized exact backfill request', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
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
    expect(recordVideoHistory).toHaveBeenCalledExactlyOnceWith(null, null);
    mocked(recordVideoHistory).mockRejectedValueOnce(new Error('list failed'));
    const failed = await POST(post({ history: 'backfill' }));
    expect(failed.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(approveVideoPublication).not.toHaveBeenCalled();
  });

  it('downloads only the named artifact on an authorized cold publication', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    mocked(readStoredArtifact).mockResolvedValueOnce(null);
    mocked(storeVideoArtifact).mockResolvedValueOnce(saved as never);
    mocked(approveVideoPublication).mockResolvedValue(receipt as never);
    mockGithub();
    const result = await POST(post(mergeBody));
    expect(result.status).toBe(200);
    expect(storeVideoArtifact).toHaveBeenCalledWith(
      '10',
      artifact,
      expect.any(Blob),
      expect.any(AbortSignal),
      { artifact, ...selected },
    );
    expect(readStoredArtifact).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/zip'))).toHaveLength(2);
  });

  it('keeps an existing index readable if approval storage fails', async () => {
    stubEnv('INVALIDATE_SECRET', 'test-secret');
    mocked(videoStorageEnabled).mockReturnValue(true);
    mocked(readStoredArtifact).mockResolvedValue(saved as never);
    mocked(storedArtifacts).mockResolvedValue([artifact]);
    mocked(approveVideoPublication).mockRejectedValue(new Error('approval storage failed'));
    mockGithub();
    const failed = await POST(post(mergeBody));
    expect(failed.status).toBe(502);
    const result = await GET(request('?run=10&artifact=20&format=media'));
    expect(await result.json()).toEqual(saved);
    expect(storeVideoArtifact).not.toHaveBeenCalled();
  });
});
