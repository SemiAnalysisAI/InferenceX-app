import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { head, put } from '@vercel/blob';
import type * as BlobSdk from '@vercel/blob';
import { readStoredArtifact, storeVideoArtifact } from './video-storage';
import { storedBundle, storedFidelityBundle } from '@/components/video-benchmark/stored';
import { fidelityFixture } from '@/components/video-benchmark/fidelity.fixture';

vi.mock('@vercel/blob', async (original) => ({
  ...(await original<typeof BlobSdk>()),
  head: vi.fn((path: string) =>
    Promise.resolve({
      url: `https://test.public.blob.vercel-storage.com/${path}`,
      downloadUrl: `https://test.public.blob.vercel-storage.com/${path}?download=1`,
    }),
  ),
  put: vi.fn((path: string) =>
    Promise.resolve({
      url: `https://test.public.blob.vercel-storage.com/${path}`,
      downloadUrl: `https://test.public.blob.vercel-storage.com/${path}?download=1`,
    }),
  ),
}));
const artifact = { id: 20, name: 'h3-video-10-1', size_in_bytes: 100, expired: false };
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
function archive(corrupt = false, extra: Record<string, string> = {}) {
  const files = {
    'manifest.json': JSON.stringify({
      schema_version: 1,
      run_id: '10',
      run_attempt: '1',
      git_commit: 'a'.repeat(40),
      ci: { repository: 'SemiAnalysisAI/InferenceX' },
    }),
    'synthetic.mp4': 'Synthetic test bytes, not a playable benchmark clip',
    ...extra,
  };
  const sums = Object.entries(files)
    .map(([path, body]) => `${digest(body)}  ${path}`)
    .join('\n');
  return new Blob([
    zipSync(
      Object.fromEntries(
        Object.entries({
          ...files,
          'synthetic.mp4': corrupt ? 'changed' : files['synthetic.mp4'],
          SHA256SUMS: sums,
        }).map(([path, body]) => [path, strToU8(body)]),
      ),
    ).buffer,
  ]);
}
beforeEach(() => {
  vi.mocked(put).mockClear();
  vi.mocked(head).mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('persistent H3 media', () => {
  it('publishes native fidelity metadata while reusing already published original videos', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const fixture = await fidelityFixture();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      const original = fixture.originals.find((item) => url.includes(`/runs/${item.runId}/`));
      if (original) return Promise.resolve(Response.json(original));
      for (const [id, files] of fixture.originalFiles)
        if (url.endsWith(`/${id}/SHA256SUMS`))
          return Promise.resolve(new Response(files.get('SHA256SUMS')));
      throw new Error(`Unexpected synthetic URL: ${url}`);
    });
    const zip = new Blob([
      zipSync(
        Object.fromEntries(
          await Promise.all(
            [...fixture.files].map(async ([path, blob]) => [
              path,
              new Uint8Array(await blob.arrayBuffer()),
            ]),
          ),
        ),
      ).buffer,
    ]);
    const result = await storeVideoArtifact(
      fixture.runId,
      fixture.artifact,
      zip,
      new AbortController().signal,
    );
    expect(result.sources[0].kind).toBe('fidelity');
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(result));
    const saved = await readStoredArtifact(fixture.runId, fixture.artifact);
    expect(storedFidelityBundle(saved!.sources[0]).comparisonSha256).toBe(
      fixture.checksums.get('comparison.json'),
    );
    expect(result.sources[0].assets.filter(([path]) => path.endsWith('.mp4'))).toHaveLength(4);
    expect(result.sources[0].assets.find(([path]) => path.endsWith('.mp4'))?.[1].url).toContain(
      '/101/gpu/c1/baseline/artifacts/',
    );
    expect(vi.mocked(put).mock.calls.some((call) => call[2]?.contentType === 'video/mp4')).toBe(
      false,
    );
    expect(vi.mocked(put).mock.calls.at(-1)?.[0]).toBe(
      'h3-video-media/v1/runs/789/h3-fidelity-789-1_987.json',
    );
  });

  it.each(['missing', 'digest', 'seal', 'media'])(
    'does not publish fidelity with an unaccepted original source: %s',
    async (failure) => {
      vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
      const fixture = await fidelityFixture();
      if (failure === 'missing') fixture.originals[0].sources = [];
      if (failure === 'digest') fixture.originals[0].artifact.digest = `sha256:${'0'.repeat(64)}`;
      if (failure === 'media')
        fixture.originals[0].sources[0].assets = fixture.originals[0].sources[0].assets.filter(
          ([path]) => !path.endsWith('.mp4'),
        );
      vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const url = String(input);
        const original = fixture.originals.find((item) => url.includes(`/runs/${item.runId}/`));
        if (original) return Promise.resolve(Response.json(original));
        for (const [id, files] of fixture.originalFiles)
          if (url.endsWith(`/${id}/SHA256SUMS`))
            return Promise.resolve(
              new Response(failure === 'seal' ? 'Changed source seal' : files.get('SHA256SUMS')),
            );
        throw new Error(`Unexpected synthetic URL: ${url}`);
      });
      const zip = new Blob([
        zipSync(
          Object.fromEntries(
            await Promise.all(
              [...fixture.files].map(async ([path, blob]) => [
                path,
                new Uint8Array(await blob.arrayBuffer()),
              ]),
            ),
          ),
        ).buffer,
      ]);
      await expect(
        storeVideoArtifact(fixture.runId, fixture.artifact, zip, new AbortController().signal),
      ).rejects.toThrow();
      expect(put).not.toHaveBeenCalled();
    },
  );
  it('reads the trusted listed index URL without a redundant HEAD request', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const indexUrl =
      'https://test.public.blob.vercel-storage.com/h3-video-media/v1/runs/10/h3-video-10-1_20.json';
    const saved = { storageVersion: 1, runId: '10', artifact, sources: [] };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(saved));
    expect(await readStoredArtifact('10', { ...artifact, indexUrl })).toEqual(saved);
    expect(head).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(indexUrl, { signal: expect.any(AbortSignal) });
  });

  it('publishes verified files before the index and restores metadata without media bytes', async () => {
    const result = await storeVideoArtifact(
      '10',
      artifact,
      archive(),
      new AbortController().signal,
    );
    const calls = vi.mocked(put).mock.calls;
    expect(calls.at(-1)?.[0]).toBe('h3-video-media/v1/runs/10/h3-video-10-1_20.json');
    const video = calls.find(([path]) => path.endsWith('/synthetic.mp4'))!;
    expect(video[0]).toContain(digest('Synthetic test bytes, not a playable benchmark clip'));
    expect(video[2]).toMatchObject({
      access: 'public',
      contentType: 'video/mp4',
      allowOverwrite: false,
    });
    const source = result.sources[0];
    expect(source.assets.find(([path]) => path === 'synthetic.mp4')?.[1].downloadUrl).toContain(
      'download=1',
    );
    const bundle = storedBundle(source);
    expect(bundle.manifestSha256).toHaveLength(64);
    expect(bundle.files.has('synthetic.mp4')).toBe(false);
  });
  it('keeps serving telemetry downloadable without embedding it in the page data', async () => {
    const serving = 'gpu/c1/supervisor/baseline/telemetry.jsonl';
    const legacy = 'gpu/supervisor/baseline/telemetry.jsonl';
    const result = await storeVideoArtifact(
      '10',
      artifact,
      archive(false, { [serving]: 'synthetic serving log', [legacy]: 'synthetic legacy log' }),
      new AbortController().signal,
    );
    expect(result.sources[0].texts).toEqual([[legacy, 'synthetic legacy log']]);
    expect(result.sources[0].assets.some(([path]) => path === serving)).toBe(true);
    expect(result.sources[0].checksums).toContainEqual([serving, digest('synthetic serving log')]);
  });
  it('removes embedded serving logs from existing indexes while preserving downloads', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const path = 'gpu/c2/supervisor/baseline/telemetry.jsonl';
    const assets = [
      [path, { url: 'https://media.test/raw', downloadUrl: 'https://media.test/raw?download=1' }],
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        storageVersion: 1,
        runId: '10',
        artifact,
        sources: [
          {
            id: '10',
            documents: [],
            checksums: [],
            assets,
            texts: [
              [path, 'old embedded log'],
              ['report/index.html', '<p>Report</p>'],
            ],
          },
        ],
      }),
    );
    const result = await readStoredArtifact('10', artifact);
    expect(result?.sources[0].texts).toEqual([['report/index.html', '<p>Report</p>']]);
    expect(result?.sources[0].assets).toEqual(assets);
  });
  it('reuses an immutable object regardless of SDK conflict wording', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('Different SDK conflict wording'));
    const result = await storeVideoArtifact(
      '10',
      artifact,
      archive(),
      new AbortController().signal,
    );
    expect(result.artifact.stored).toBe(true);
    expect(head).toHaveBeenCalledTimes(1);
  });
  it('preserves upload failures when no immutable object exists', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('Storage upload failed'));
    vi.mocked(head).mockRejectedValueOnce(new Error('Object missing'));
    await expect(
      storeVideoArtifact('10', artifact, archive(), new AbortController().signal),
    ).rejects.toThrow('Storage upload failed');
    expect(vi.mocked(put).mock.calls.some(([path]) => path.includes('/runs/'))).toBe(false);
  });
  it('does not publish unverified bytes', async () => {
    await expect(
      storeVideoArtifact('10', artifact, archive(true), new AbortController().signal),
    ).rejects.toThrow('checksum mismatch');
    expect(put).not.toHaveBeenCalled();
  });
});
