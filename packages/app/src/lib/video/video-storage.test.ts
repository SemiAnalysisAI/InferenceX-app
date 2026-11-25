import { createHash } from 'node:crypto';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi, mock } from 'bun:test';
import { mocked, stubEnv, unstubAllEnvs } from '@/test/helpers';
import { BlobNotFoundError, head, put, list } from '@vercel/blob';
import {
  approveVideoPublication,
  readPublishedArtifact,
  readVideoPublication,
  readStoredArtifact,
  requireSelectedSource,
  derivedMedia,
  storeVideoArtifact,
} from './video-storage';
import { publishedVideoHistory } from './video-history-store';
import { storedBundle } from '@/components/video-benchmark/stored';

const actual = { ...(await import('@vercel/blob')) };
mock.module('@vercel/blob', () => ({
  ...actual,
  list: vi.fn(),
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
const digest = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
function archive(corrupt = false, extra: Record<string, string> = {}) {
  const files = {
    'manifest.json': JSON.stringify({
      schema_version: 1,
      run_id: '10',
      run_attempt: '1',
      git_commit: 'a'.repeat(40),
      ci: { repository: 'SemiAnalysisAI/InferenceX', head_sha: 'c'.repeat(40) },
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
/** A ZIP as GitHub reports it, with the digests a merge selection names its bundle by. */
async function uploaded(zip: Blob) {
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const files = unzipSync(bytes);
  return {
    published: { ...artifact, digest: `sha256:${digest(bytes)}` },
    selected: {
      manifestSha256: digest(files['manifest.json']),
      sha256sumsSha256: digest(files.SHA256SUMS),
    },
  };
}
async function stored(zip = archive()) {
  const { published, selected } = await uploaded(zip);
  const signal = new AbortController().signal;
  const saved = await storeVideoArtifact('10', published, zip, signal, selected);
  return { saved, published, selected };
}
beforeEach(() => {
  mocked(put).mockClear();
  mocked(head).mockClear();
});
afterEach(() => {
  unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('persistent H3 media', () => {
  it('writes one immutable approval after the index and binds both to the merge selection', async () => {
    stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const zip = archive();
    const { published, selected } = await uploaded(zip);
    const signal = new AbortController().signal;
    const altered = (['manifestSha256', 'sha256sumsSha256'] as const).map((field) => ({
      ...selected,
      [field]: '0'.repeat(64),
    }));
    // The ZIP is checked against the selection before the first write, so a mismatch stores nothing.
    for (const other of altered)
      await expect(storeVideoArtifact('10', published, zip, signal, other)).rejects.toThrow(
        'merge selection',
      );
    expect(put).not.toHaveBeenCalled();
    const saved = await storeVideoArtifact('10', published, zip, signal, selected);
    // An already stored copy answers for the same two digests.
    for (const other of altered)
      expect(() => requireSelectedSource(saved, other)).toThrow('merge selection');
    expect(() => requireSelectedSource(saved, selected)).not.toThrow();
    let receipt: string | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(receipt)));
    const before = mocked(put).mock.calls.length;
    mocked(head).mockRejectedValueOnce(new BlobNotFoundError());
    mocked(put).mockImplementationOnce((path, body) => {
      receipt = String(body);
      return Promise.resolve({
        url: `https://test.public.blob.vercel-storage.com/${path}`,
        downloadUrl: `https://test.public.blob.vercel-storage.com/${path}?download=1`,
      } as Awaited<ReturnType<typeof put>>);
    });
    const approved = await approveVideoPublication(saved, '99', selected, signal);
    expect(approved).toEqual({
      version: 2,
      runId: '10',
      artifactId: 20,
      artifactName: artifact.name,
      artifactDigest: published.digest,
      mergeRunId: '99',
      selected,
      sources: [
        {
          id: '10',
          kind: 'observation',
          sha256: selected.manifestSha256,
          checkoutSha: 'a'.repeat(40),
        },
      ],
    });
    expect(mocked(put).mock.calls[before][0]).toBe(
      'h3-video-media/v1/approvals/10/h3-video-10-1_20.json',
    );
    expect(await readVideoPublication('10', artifact, saved)).toEqual(approved);
    await approveVideoPublication(saved, '99', selected, signal);
    await expect(approveVideoPublication(saved, '100', selected, signal)).rejects.toThrow(
      'different merge identity',
    );
    expect(mocked(put).mock.calls).toHaveLength(before + 1);
    mocked(list).mockResolvedValue({
      blobs: [
        {
          ...blob(10),
          pathname: 'h3-video-media/v1/runs/10/h3-video-10-1_20.json',
          url: 'https://test.public.blob.vercel-storage.com/runs/10/index',
        },
      ],
      hasMore: false,
      cursor: undefined,
    });
    mocked(fetch).mockImplementation((url) =>
      Promise.resolve(Response.json(String(url).includes('/runs/') ? saved : approved)),
    );
    const { page: history, complete } = await publishedVideoHistory(1);
    expect(history.entries[0].approved).toBe(true);
    expect(complete).toBe(true);
  });

  it('fails closed for a missing or mismatched approval without changing the stored source', async () => {
    stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const { saved, published } = await stored();
    mocked(head).mockRejectedValueOnce(new BlobNotFoundError());
    expect(await readVideoPublication('10', artifact, saved)).toBeNull();
    expect(saved.sources).toHaveLength(1);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        version: 1,
        runId: '10',
        artifactId: artifact.id,
        artifactName: artifact.name,
        artifactDigest: published.digest,
        mergeRunId: '99',
        sources: [
          { id: '10', kind: 'observation', sha256: '0'.repeat(64), checkoutSha: 'a'.repeat(40) },
        ],
      }),
    );
    await expect(readVideoPublication('10', artifact, saved)).rejects.toThrow('does not match');
    // A receipt written before merge selections (version 1) still counts when it matches.
    const sha256 = storedBundle(saved.sources[0]).manifestSha256;
    const legacy = {
      version: 1,
      runId: '10',
      artifactId: artifact.id,
      artifactName: artifact.name,
      artifactDigest: published.digest,
      mergeRunId: '99',
      sources: [{ id: '10', kind: 'observation', sha256, checkoutSha: 'a'.repeat(40) }],
    };
    fetcher.mockImplementation(() => Promise.resolve(Response.json(legacy)));
    expect(await readVideoPublication('10', artifact, saved)).toEqual(legacy);
    const selected = { manifestSha256: sha256, sha256sumsSha256: 'e'.repeat(64) };
    const { sources, ...identity } = legacy;
    // Without a merge run not even a version 2 receipt approves.
    const unmerged = { ...identity, version: 2, mergeRunId: null, selected, sources };
    fetcher.mockImplementation(() => Promise.resolve(Response.json(unmerged)));
    expect(await readVideoPublication('10', artifact, saved)).toBeNull();
    const current = { ...identity, version: 2, selected, sources };
    fetcher.mockImplementation(() => Promise.resolve(Response.json(current)));
    expect(await readVideoPublication('10', artifact, saved)).toEqual(current);
    expect(mocked(put).mock.calls.some(([path]) => path.includes('/approvals/'))).toBe(false);
  });

  it('leaves the immutable media index intact when approval upload fails', async () => {
    stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const { saved, selected } = await stored();
    const indexWrites = mocked(put).mock.calls.filter(([path]) => path.includes('/runs/'));
    expect(indexWrites).toHaveLength(1);
    mocked(head)
      .mockRejectedValueOnce(new BlobNotFoundError())
      .mockRejectedValueOnce(new BlobNotFoundError())
      .mockRejectedValueOnce(new BlobNotFoundError());
    mocked(put).mockRejectedValueOnce(new Error('Approval upload failed'));
    await expect(
      approveVideoPublication(saved, '99', selected, new AbortController().signal),
    ).rejects.toThrow('Approval upload failed');
    expect(saved.sources).toHaveLength(1);
    expect(mocked(put).mock.calls.filter(([path]) => path.includes('/runs/'))).toHaveLength(1);
    expect(await readVideoPublication('10', artifact, saved)).toBeNull();
  });

  it('still reads a receipt as approved when its bundle no longer passes serving validation', async () => {
    stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    // Stands for a serving reader that changed after the approval: it rejects this matrix today.
    const matrix = JSON.stringify({ schema_version: '0' });
    const { saved, published, selected } = await stored(
      archive(false, { 'serving-smoke.json': matrix }),
    );
    const receipt = {
      version: 2,
      runId: '10',
      artifactId: artifact.id,
      artifactName: artifact.name,
      artifactDigest: published.digest,
      mergeRunId: '99',
      selected,
      sources: [
        {
          id: '10',
          kind: 'observation',
          sha256: selected.manifestSha256,
          checkoutSha: 'a'.repeat(40),
        },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(receipt));
    expect(await readVideoPublication('10', artifact, saved)).toEqual(receipt);
  });

  it('reads the trusted listed index URL without a redundant HEAD request', async () => {
    stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const indexUrl =
      'https://test.public.blob.vercel-storage.com/h3-video-media/v1/runs/10/h3-video-10-1_20.json';
    const saved = { storageVersion: 1, runId: '10', artifact, sources: [] };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(saved));
    expect(await readStoredArtifact('10', { ...artifact, indexUrl })).toEqual(saved);
    expect(head).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(indexUrl, { signal: expect.any(AbortSignal) });
  });

  it('serves the stored index when its quality attachment cannot be read', async () => {
    stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const indexUrl =
      'https://test.public.blob.vercel-storage.com/h3-video-media/v1/runs/10/h3-video-10-1_20.json';
    const saved = { storageVersion: 1, runId: '10', artifact, sources: [] };
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      Promise.resolve(
        url === indexUrl ? Response.json(saved) : new Response('unavailable', { status: 500 }),
      ),
    );
    expect(await readPublishedArtifact('10', { ...artifact, indexUrl })).toEqual({
      saved,
      complete: false,
    });
  });
  it('publishes verified files before the index and restores metadata without media bytes', async () => {
    const { saved: result } = await stored();
    const calls = mocked(put).mock.calls;
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
    const { saved: result } = await stored(
      archive(false, { [serving]: 'synthetic serving log', [legacy]: 'synthetic legacy log' }),
    );
    expect(result.sources[0].texts).toEqual([[legacy, 'synthetic legacy log']]);
    expect(result.sources[0].assets.some(([path]) => path === serving)).toBe(true);
    expect(result.sources[0].checksums).toContainEqual([serving, digest('synthetic serving log')]);
  });
  it('removes embedded serving logs from existing indexes while preserving downloads', async () => {
    stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
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
    mocked(put).mockRejectedValueOnce(new Error('Different SDK conflict wording'));
    const { saved: result } = await stored();
    expect(result.artifact.stored).toBe(true);
    expect(head).toHaveBeenCalledTimes(1);
  });
  it('preserves upload failures when no immutable object exists', async () => {
    mocked(put).mockRejectedValueOnce(new Error('Storage upload failed'));
    mocked(head).mockRejectedValueOnce(new Error('Object missing'));
    await expect(stored()).rejects.toThrow('Storage upload failed');
    expect(mocked(put).mock.calls.some(([path]) => path.includes('/runs/'))).toBe(false);
  });
  it('does not publish unverified bytes', async () => {
    await expect(stored(archive(true))).rejects.toThrow('SHA256 mismatch');
    expect(put).not.toHaveBeenCalled();
  });
});

const blob = (id: number) => ({
  pathname: `h3-video-media/v1/runs/${id}/h3-video-${id}-1_${id}.json`,
  url: `https://test.public.blob.vercel-storage.com/${id}`,
  downloadUrl: '',
  size: 1,
  etag: 'synthetic',
  uploadedAt: new Date(`2026-09-${String(id).padStart(2, '0')}T00:00:00Z`),
});

const uploadReceipt = (pathname: string) => ({
  ...blob(10),
  pathname,
  url: `https://store.public.blob.vercel-storage.com/${pathname}`,
});

describe('rendition receipts', () => {
  const source = 'a'.repeat(64);
  const output = 'b'.repeat(64);

  it('resolves each original hash to its rendition MP4 from listed receipt paths alone', async () => {
    stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const fetcher = vi.spyOn(globalThis, 'fetch');
    mocked(list)
      .mockResolvedValueOnce({
        blobs: [
          uploadReceipt(`h3-video-media/v1/renditions/${source}/web-h264-crf23/${output}.json`),
          // A second encode of the same original keeps the first listed receipt.
          uploadReceipt(
            `h3-video-media/v1/renditions/${source}/web-h264-crf23/${'f'.repeat(64)}.json`,
          ),
        ],
        hasMore: true,
        cursor: 'next',
      })
      .mockResolvedValueOnce({
        blobs: [
          uploadReceipt(`h3-video-media/v1/renditions/${'c'.repeat(64)}/web-vp9/${output}.json`),
          uploadReceipt(`h3-video-media/v1/renditions/${'d'.repeat(64)}/web-h264-crf23/short.json`),
        ],
        hasMore: false,
        cursor: undefined,
      });
    expect(await derivedMedia()).toEqual(
      new Map([
        [
          source,
          {
            previewUrl: `https://store.public.blob.vercel-storage.com/h3-video-media/v1/objects/${output}/web-h264-crf23.mp4`,
          },
        ],
      ]),
    );
    expect(list).toHaveBeenLastCalledWith({
      prefix: 'h3-video-media/v1/renditions/',
      cursor: 'next',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resolves a poster receipt to its JPEG as posterUrl beside the rendition', async () => {
    stubEnv('BLOB_READ_WRITE_TOKEN', 'synthetic-test-token');
    const poster = 'e'.repeat(64);
    const posterOnly = 'c'.repeat(64);
    mocked(list).mockResolvedValueOnce({
      blobs: [
        uploadReceipt(`h3-video-media/v1/renditions/${source}/poster-f0-w672-q4/${poster}.json`),
        uploadReceipt(`h3-video-media/v1/renditions/${source}/web-h264-crf23/${output}.json`),
        // A poster needs no rendition, and an unknown profile is ignored.
        uploadReceipt(
          `h3-video-media/v1/renditions/${posterOnly}/poster-f0-w672-q4/${poster}.json`,
        ),
        uploadReceipt(`h3-video-media/v1/renditions/${posterOnly}/poster-f1-w448/${output}.json`),
      ],
      hasMore: false,
      cursor: undefined,
    });
    const objects = 'https://store.public.blob.vercel-storage.com/h3-video-media/v1/objects';
    expect(await derivedMedia()).toEqual(
      new Map([
        [
          source,
          {
            posterUrl: `${objects}/${poster}/poster-f0-w672-q4.jpg`,
            previewUrl: `${objects}/${output}/web-h264-crf23.mp4`,
          },
        ],
        [posterOnly, { posterUrl: `${objects}/${poster}/poster-f0-w672-q4.jpg` }],
      ]),
    );
  });
});
