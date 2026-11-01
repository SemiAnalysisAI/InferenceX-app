import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readVideoReplay } from '@/components/video-benchmark/replay';
import { GET } from '@/app/api/video-runs/route';
import { sha256 } from '@/components/video-benchmark/bundle';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';

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

async function configureCollection(artifactIds: number[], invalidArtifact?: number) {
  const original = await configure();
  const manifest = process.env.E2E_VIDEO_REPLAY_MANIFEST!;
  const artifacts = await Promise.all(
    artifactIds.map(async (id) => {
      const metadataPath = `${manifest}.${id}.json`;
      const zipPath = `${manifest}.${id}.zip`;
      await Promise.all([
        writeFile(metadataPath, JSON.stringify({ id })),
        writeFile(zipPath, `zip-${id}`),
      ]);
      return { zipPath, metadataPath, expectedPlanSha256: String(id).repeat(64) };
    }),
  );
  await writeFile(manifest, JSON.stringify({ artifacts }));
  vi.mocked(readVideoReplay).mockImplementation(async (zip, metadata, expectedPlanSha256) => {
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
      throw new Error('Expected artifact metadata');
    const id = Number(metadata.id);
    expect(await zip.text()).toBe(`zip-${id}`);
    expect(expectedPlanSha256).toBe(String(id).repeat(64));
    return {
      ...original,
      report: {
        ...original.report,
        ok: id !== invalidArtifact,
        errors: id === invalidArtifact ? ['plan SHA256 mismatch'] : [],
      },
      stored: {
        ...original.stored,
        artifact: { ...original.stored.artifact, id },
        sources: original.stored.sources.map((source) => ({ ...source })),
      },
      media: new Map([['123', new Map([[mediaPath, new Blob([`clip-${id}`])]])]]),
    };
  });
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.mocked(readVideoReplay).mockReset();
  fetchMock.mockReset();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('original-artifact development replay', () => {
  it('fails a bad quality attachment closed without returning its private file path', async () => {
    await configure();
    const manifest = process.env.E2E_VIDEO_REPLAY_MANIFEST!;
    const config = JSON.parse(await readFile(manifest, 'utf8'));
    await writeFile(
      manifest,
      JSON.stringify({
        ...config,
        quality: { path: '/private/missing-quality.json', sha256: '0'.repeat(64) },
      }),
    );
    const response = await GET(new NextRequest('http://localhost/api/video-runs?format=history'));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('Quality attachment failed verification');
    expect(body).not.toContain('/private/');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('attaches sealed quality without approval and isolates reference byte-range URLs', async () => {
    const replay = await configure();
    const f = referenceQualityFixture();
    Object.assign(replay.stored, f.stored);
    const referenceRoot = await mkdtemp(join(tmpdir(), 'replay-reference-'));
    dirs.push(referenceRoot);
    await mkdir(join(referenceRoot, 'drum-taps'));
    const referenceBytes = 'reference-video';
    const referenceMediaSha = await sha256(new Blob([referenceBytes]));
    f.receipt.cases[0].sha256['reference.mp4'] = referenceMediaSha;
    const receiptText = JSON.stringify(f.receipt),
      receiptSha = await sha256(new Blob([receiptText]));
    const sums = `${receiptSha}  reference.json\n${referenceMediaSha}  drum-taps/reference.mp4\n`;
    f.attachment.references = [
      {
        receipt_path: join(referenceRoot, 'reference.json'),
        receipt_sha256: receiptSha,
        checksums_sha256: await sha256(new Blob([sums])),
      },
    ];
    Object.assign(f.attachment.pairs[0].reference, {
      receipt_sha256: receiptSha,
      media_sha256: referenceMediaSha,
    });
    const attachmentText = JSON.stringify(f.attachment),
      qualityPath = join(referenceRoot, 'quality.json');
    await Promise.all([
      writeFile(qualityPath, attachmentText),
      writeFile(join(referenceRoot, 'reference.json'), receiptText),
      writeFile(join(referenceRoot, 'SHA256SUMS'), sums),
      writeFile(join(referenceRoot, 'drum-taps/reference.mp4'), referenceBytes),
    ]);
    const manifestPath = process.env.E2E_VIDEO_REPLAY_MANIFEST!;
    const config = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...config,
        quality: { path: qualityPath, sha256: await sha256(new Blob([attachmentText])) },
      }),
    );
    const response = await GET(
      new NextRequest('http://localhost/api/video-runs?run=123&artifact=7&format=published'),
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const saved = await response.json();
    expect(saved.quality[0]).toMatchObject({ psnrDb: 25, releaseQualified: false });
    expect(JSON.stringify(saved)).not.toContain(referenceRoot);
    const referenceUrl = new URL(saved.quality[0].reference.url, 'http://localhost');
    const video = await GET(new NextRequest(referenceUrl, { headers: { range: 'bytes=0-8' } }));
    expect(video.status).toBe(206);
    expect(await video.text()).toBe('reference');
    referenceUrl.searchParams.set('artifact', '8');
    const otherArtifact = await GET(new NextRequest(referenceUrl));
    expect(otherArtifact.status).toBe(404);
    referenceUrl.searchParams.set('artifact', '7');
    referenceUrl.searchParams.set('path', '../reference.json');
    const unsafePath = await GET(new NextRequest(referenceUrl));
    expect(unsafePath.status).toBe(404);
    const historyResponse = await GET(
      new NextRequest('http://localhost/api/video-runs?format=history'),
    );
    const history = await historyResponse.json();
    expect(history.entries[0].approved).toBe(false);
    expect(history.entries[0].publishedAt).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
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

  it('keeps same-run artifacts and colliding media paths separate without approval', async () => {
    await configureCollection([7, 8]);
    const history = await GET(new NextRequest('http://localhost/api/video-runs?format=history'));
    expect(history.status).toBe(200);
    const page = await history.json();
    expect(page.entries).toHaveLength(2);
    expect(page.entries.map((entry: { artifact: { id: number } }) => entry.artifact.id)).toEqual([
      7, 8,
    ]);
    for (const entry of page.entries) {
      expect(entry).toMatchObject({ runId: '123', approved: false, publishedAt: null });
      expect(entry.sources[0].releaseQualified).toBe(false);
      const artifact = await GET(
        new NextRequest(
          `http://localhost/api/video-runs?run=123&artifact=${entry.artifact.id}&format=published`,
        ),
      );
      expect(artifact.status).toBe(200);
      const saved = await artifact.json();
      const assetUrl = saved.sources[0].assets[0][1].url;
      const media = await GET(new NextRequest(`http://localhost${assetUrl}`));
      expect(await media.text()).toBe(`clip-${entry.artifact.id}`);
    }
    const wrongRun = await GET(new NextRequest(url('').replace('run=123', 'run=124')));
    expect(wrongRun.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { ids: [], error: 'nonempty artifacts array' },
    { ids: [7, 7], error: 'Duplicate replay artifact' },
  ])('rejects an ambiguous or empty collection: $ids', async ({ ids, error }) => {
    await configureCollection(ids);
    const response = await GET(new NextRequest('http://localhost/api/video-runs?format=history'));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain(error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('withholds every artifact when the second member fails verification', async () => {
    await configureCollection([7, 8], 8);
    for (const path of ['http://localhost/api/video-runs?format=history', url('')]) {
      const response = await GET(new NextRequest(path));
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toContain('plan SHA256 mismatch');
    }
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
