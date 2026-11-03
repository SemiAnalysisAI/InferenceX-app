import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readVideoReplay } from '@/components/video-benchmark/replay';
import { GET } from '@/app/api/video-runs/route';
import { sha256 } from '@/components/video-benchmark/bundle';
import { diagnosticQualityFixture } from '@/components/video-benchmark/diagnostic-quality.fixture';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';

vi.mock('@/components/video-benchmark/replay', () => ({ readVideoReplay: vi.fn() }));
const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
const dirs: string[] = [];
const mediaPath = 'gpu/c1/baseline/artifacts/clip.mp4';
const assetUrl = `http://localhost/api/video-runs?run=123&artifact=7&format=replay-asset&source=123&path=${encodeURIComponent(mediaPath)}`;

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

async function configureDiagnostic() {
  const replay = await configure();
  const f = diagnosticQualityFixture();
  Object.assign(replay.stored, f.original.stored);
  const dir = await mkdtemp(join(tmpdir(), 'replay-diagnostic-'));
  dirs.push(dir);
  const pair = f.attachment.pairs[0];
  for (const role of ['candidate', 'reference'] as const) {
    const root = join(dir, role);
    const receipt = f[role];
    await mkdir(join(root, 'drum-taps'), { recursive: true });
    const bytes = `new-${role}-video`;
    receipt.media.sha256 = await sha256(new Blob([bytes]));
    const evidence = 'private native receipt';
    receipt.evidence[0].sha256 = await sha256(new Blob([evidence]));
    const receiptText = JSON.stringify(receipt);
    const receiptSha = await sha256(new Blob([receiptText]));
    const sums = `${receiptSha}  diagnostic.json\n${receipt.media.sha256}  ${receipt.media.path}\n${receipt.evidence[0].sha256}  native.json\n`;
    pair[role] = {
      receipt_path: join(root, 'diagnostic.json'),
      receipt_sha256: receiptSha,
      checksums_sha256: await sha256(new Blob([sums])),
    };
    await Promise.all([
      writeFile(pair[role].receipt_path, receiptText),
      writeFile(join(root, 'SHA256SUMS'), sums),
      writeFile(join(root, receipt.media.path), bytes),
      writeFile(join(root, 'native.json'), evidence),
    ]);
  }
  const text = JSON.stringify(f.attachment),
    path = join(dir, 'diagnostics.json');
  await writeFile(path, text);
  const manifest = process.env.E2E_VIDEO_REPLAY_MANIFEST!;
  const config = JSON.parse(await readFile(manifest, 'utf8'));
  await writeFile(
    manifest,
    JSON.stringify({ ...config, diagnostics: { path, sha256: await sha256(new Blob([text])) } }),
  );
  return { dir };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.mocked(readVideoReplay).mockReset();
  fetchMock.mockReset();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('original-artifact development replay', () => {
  it('serves new diagnostic media under isolated receipt identities without new History observations', async () => {
    const { dir } = await configureDiagnostic();
    const response = await GET(
      new NextRequest('http://localhost/api/video-runs?run=123&artifact=7&format=published'),
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const saved = await response.json();
    expect(saved.diagnostics).toHaveLength(1);
    expect(saved.diagnostics[0]).toMatchObject({
      scope: 'matched-noise-diagnostic',
      psnrDb: 25,
      releaseQualified: false,
    });
    expect(JSON.stringify(saved)).not.toContain(dir);
    for (const role of ['candidate', 'reference']) {
      const diagnosticUrl = new URL(saved.diagnostics[0][role].url, 'http://localhost');
      const media = await GET(new NextRequest(diagnosticUrl, { headers: { range: 'bytes=0-2' } }));
      expect(media.status).toBe(206);
      expect(await media.text()).toBe('new');
      diagnosticUrl.searchParams.set('path', 'native.json');
      const deniedEvidence = await GET(new NextRequest(diagnosticUrl));
      expect(deniedEvidence.status).toBe(404);
      diagnosticUrl.searchParams.set('path', saved.diagnostics[0][role].media_path);
      diagnosticUrl.searchParams.set('artifact', '8');
      const deniedArtifact = await GET(new NextRequest(diagnosticUrl));
      expect(deniedArtifact.status).toBe(404);
    }
    const historyResponse = await GET(
      new NextRequest('http://localhost/api/video-runs?format=history'),
    );
    const history = await historyResponse.json();
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({ approved: false, publishedAt: null });
    expect(history.entries[0].sources[0].observations).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    'candidate/drum-taps/candidate.mp4',
    'reference/drum-taps/reference.mp4',
    'candidate/native.json',
    'candidate/diagnostic.json',
    'candidate/SHA256SUMS',
    'diagnostics.json',
  ])('rejects tampered diagnostic %s without exposing private paths', async (member) => {
    const { dir } = await configureDiagnostic();
    await writeFile(join(dir, member), 'tampered');
    const response = await GET(new NextRequest('http://localhost/api/video-runs?format=history'));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('Diagnostic attachment failed verification');
    expect(body).not.toContain(dir);
    expect(fetchMock).not.toHaveBeenCalled();
  });
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

  it('serves only verified member bytes with GET ranges, HEAD, and 416', async () => {
    await configure();
    const full = await GET(new NextRequest(assetUrl));
    expect(full.status).toBe(200);
    expect(full.headers.get('content-length')).toBe('10');
    expect(full.headers.get('cache-control')).toBe('private, no-store');
    expect(await full.text()).toBe('0123456789');
    const part = await GET(new NextRequest(assetUrl, { headers: { range: 'bytes=2-5' } }));
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await part.text()).toBe('2345');
    const suffix = await GET(new NextRequest(assetUrl, { headers: { range: 'bytes=-3' } }));
    expect(await suffix.text()).toBe('789');
    // Next auto-implements HEAD by calling GET when the route has no HEAD export.
    const head = await GET(
      new NextRequest(assetUrl, { method: 'HEAD', headers: { range: 'bytes=2-5' } }),
    );
    expect(head.status).toBe(206);
    expect(head.headers.get('content-length')).toBe('4');
    expect(await head.text()).toBe('');
    const unsatisfiable = await GET(new NextRequest(assetUrl, { headers: { range: 'bytes=10-' } }));
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get('content-range')).toBe('bytes */10');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps same-run artifacts and colliding media paths separate without approval', async () => {
    await configureCollection([7, 8]);
    const history = await GET(new NextRequest('http://localhost/api/video-runs?format=history'));
    expect(history.status).toBe(200);
    expect(history.headers.get('x-videogenx-replay')).toBe('1');
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
      const storedAssetUrl = saved.sources[0].assets[0][1].url;
      const media = await GET(new NextRequest(`http://localhost${storedAssetUrl}`));
      expect(await media.text()).toBe(`clip-${entry.artifact.id}`);
    }
    const wrongRun = await GET(new NextRequest(assetUrl.replace('run=123', 'run=124')));
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
    for (const path of ['http://localhost/api/video-runs?format=history', assetUrl]) {
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
      assetUrl.replace('source=123', 'source=124'),
      assetUrl.replace(encodeURIComponent(mediaPath), '..%2Fsecret.mp4'),
    ]) {
      const response = await GET(new NextRequest(request));
      expect(response.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires development fixture mode and fails closed on an unreadable replay manifest', async () => {
    await configure();
    vi.stubEnv('NODE_ENV', 'production');
    const production = await GET(new NextRequest(assetUrl));
    expect(production.status).toBe(404);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('E2E_FIXTURES', '0');
    const disabled = await GET(new NextRequest(assetUrl));
    expect(disabled.status).toBe(404);
    vi.stubEnv('E2E_FIXTURES', '1');
    vi.stubEnv('E2E_VIDEO_REPLAY_MANIFEST', '/missing/replay-manifest.json');
    const failed = await GET(new NextRequest('http://localhost/api/video-runs?format=history'));
    expect(failed.status).toBe(503);
    const failure = await failed.json();
    expect(failure.error).toContain('Local replay unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
