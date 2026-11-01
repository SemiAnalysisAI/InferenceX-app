import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readVideoReplay } from '@/components/video-benchmark/replay';
import { GET } from '@/app/api/video-runs/route';

vi.mock('@/components/video-benchmark/replay', () => ({ readVideoReplay: vi.fn() }));
const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
const dirs: string[] = [];
const mediaPath = 'gpu/c1/baseline/artifacts/clip.mp4';
const url = (tail: string) =>
  `http://localhost/api/video-runs?run=123&artifact=7&format=replay-asset&source=123&path=${encodeURIComponent(mediaPath)}${tail}`;

async function configure() {
  const dir = await mkdtemp(join(tmpdir(), 'video-replay-'));
  dirs.push(dir);
  const manifest = join(dir, 'manifest.json');
  await Promise.all([
    writeFile(join(dir, 'original.zip'), 'zip'),
    writeFile(join(dir, 'metadata.json'), '{}'),
  ]);
  await writeFile(
    manifest,
    JSON.stringify({
      zipPath: join(dir, 'original.zip'),
      metadataPath: join(dir, 'metadata.json'),
      expectedPlanSha256: 'f'.repeat(64),
    }),
  );
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('E2E_FIXTURES', '1');
  vi.stubEnv('E2E_VIDEO_REPLAY_MANIFEST', manifest);
  const source = {
    id: '123',
    documents: [
      ['manifest.json', { run_id: '123' }],
      ['ci.json', { release_qualified: false }],
    ],
    checksums: [['manifest.json', 'a'.repeat(64)]],
    assets: [],
    texts: [],
  };
  const replay = {
    report: { ok: true, errors: [] },
    stored: {
      storageVersion: 1,
      runId: '123',
      artifact: { id: 7, name: 'h3-results-123-1', expired: false, size_in_bytes: 3 },
      sources: [source],
    },
    media: new Map([['123', new Map([[mediaPath, new Blob(['0123456789'])]])]]),
  } as unknown as Awaited<ReturnType<typeof readVideoReplay>>;
  vi.mocked(readVideoReplay).mockResolvedValue(replay);
  return replay;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.mocked(readVideoReplay).mockReset();
  fetchMock.mockReset();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('original-artifact development replay', () => {
  it('replaces history and exact artifact without an external read or approval', async () => {
    await configure();
    const history = await GET(new NextRequest('http://localhost/api/video-runs?format=history'));
    expect(history.status).toBe(200);
    expect(history.headers.get('x-videogenx-replay')).toBe('1');
    const page = await history.json();
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0]).toMatchObject({ runId: '123', approved: false, publishedAt: null });
    expect(page.entries[0].sources[0].releaseQualified).toBe(false);
    const artifact = await GET(
      new NextRequest('http://localhost/api/video-runs?run=123&artifact=7&format=published'),
    );
    expect(artifact.status).toBe(200);
    const saved = await artifact.json();
    expect(saved.sources[0].assets[0][1].url).toContain('format=replay-asset');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves only verified member bytes with GET ranges, HEAD, and 416', async () => {
    await configure();
    const full = await GET(new NextRequest(url('')));
    expect(full.status).toBe(200);
    expect(full.headers.get('content-length')).toBe('10');
    expect(full.headers.get('cache-control')).toBe('private, no-store');
    expect(await full.text()).toBe('0123456789');
    const part = await GET(new NextRequest(url(''), { headers: { range: 'bytes=2-5' } }));
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await part.text()).toBe('2345');
    const suffix = await GET(new NextRequest(url(''), { headers: { range: 'bytes=-3' } }));
    expect(await suffix.text()).toBe('789');
    // Next auto-implements HEAD by calling GET when the route has no HEAD export.
    const head = await GET(
      new NextRequest(url(''), { method: 'HEAD', headers: { range: 'bytes=2-5' } }),
    );
    expect(head.status).toBe(206);
    expect(head.headers.get('content-length')).toBe('4');
    expect(await head.text()).toBe('');
    const unsatisfiable = await GET(new NextRequest(url(''), { headers: { range: 'bytes=10-' } }));
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('content-range')).toBe('bytes */10');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects wrong identities and request-selected paths without external fallback', async () => {
    await configure();
    for (const request of [
      'http://localhost/api/video-runs?run=124&artifact=7&format=published',
      'http://localhost/api/video-runs?run=123&artifact=8&format=published',
      url('').replace('source=123', 'source=124'),
      url('').replace(encodeURIComponent(mediaPath), '..%2Fsecret.mp4'),
    ]) {
      const response = await GET(new NextRequest(request));
      expect(response.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires every gate and fails closed on invalid local configuration', async () => {
    await configure();
    vi.stubEnv('NODE_ENV', 'production');
    const production = await GET(new NextRequest(url('')));
    expect(production.status).toBe(404);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_FIXTURES', '0');
    const disabled = await GET(new NextRequest(url('')));
    expect(disabled.status).toBe(404);
    vi.stubEnv('E2E_FIXTURES', '1');
    vi.stubEnv('E2E_VIDEO_REPLAY_MANIFEST', '/missing/replay-manifest.json');
    const failed = await GET(new NextRequest('http://localhost/api/video-runs?format=history'));
    expect(failed.status).toBe(503);
    const failure = await failed.json();
    expect(failure.error).toContain('Local replay unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose a partially verified source when the sealed plan fails', async () => {
    const original = await configure();
    vi.mocked(readVideoReplay).mockResolvedValueOnce({
      ...original,
      report: { ...original.report, ok: false, errors: ['plan SHA256 mismatch'] },
    });
    const response = await GET(new NextRequest('http://localhost/api/video-runs?format=history'));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain('plan SHA256 mismatch');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
