import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from '@/components/video-benchmark/bundle';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { artifactFiles, type GithubRead } from './video-live-run';
import { publishVideoQuality, readTrustedQuality, trustedQualityArtifact } from './video-quality';
import { readStoredQuality, storeReferenceMedia, storeVideoQuality } from './video-storage';

vi.mock('./video-live-run', () => ({ artifactFiles: vi.fn() }));
vi.mock('./video-storage', () => ({
  readStoredQuality: vi.fn(),
  storeReferenceMedia: vi.fn(),
  storeVideoQuality: vi.fn((_artifact, quality) => Promise.resolve(quality)),
}));
const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => vi.clearAllMocks());
const encode = (value: string) => new TextEncoder().encode(value);

const trusted = {
  path: '.github/workflows/video-quality.yml',
  event: 'workflow_run',
  head_branch: 'main',
  head_sha: 'f'.repeat(40),
  repository: { full_name: 'SemiAnalysisAI/InferenceX' },
  head_repository: { full_name: 'SemiAnalysisAI/InferenceX' },
};
const qualityArtifact = (id: number, run: number, attempt = 1) => ({
  id,
  name: `h3-quality-123-${attempt}`,
  expired: false,
  size_in_bytes: 1,
  workflow_run: { id: run, head_sha: 'f'.repeat(40) },
});
function github(runs: Record<number, object>, artifacts = [qualityArtifact(20, 2)]) {
  const read = vi.fn<GithubRead>((path) => {
    const name = /^\/actions\/artifacts\?name=(?<name>[\w-]+)&per_page=100$/u.exec(path)?.groups
      ?.name;
    if (name)
      return Promise.resolve(
        Response.json({ artifacts: artifacts.filter((item) => item.name === name) }),
      );
    // Only the 'e' commit is off main.
    if (path.startsWith('/compare/'))
      return Promise.resolve(
        Response.json({ status: path.includes('e'.repeat(40)) ? 'diverged' : 'ahead' }),
      );
    return Promise.resolve(
      Response.json(runs[Number(/^\/actions\/runs\/(?<id>\d+)$/u.exec(path)?.groups?.id)]),
    );
  });
  return read;
}

describe('trusted quality artifacts', () => {
  it.each([
    ['a branch other than main', { head_branch: 'feature' }],
    ['another workflow', { path: '.github/workflows/run-sweep.yml' }],
    ['a fork pull request', { head_repository: { full_name: 'fork/InferenceX' } }],
    ['a pull request event', { event: 'pull_request' }],
    ['a commit that is not on main', { head_sha: 'e'.repeat(40) }],
  ])('rejects an artifact uploaded from %s', async (_, run) => {
    const read = github({ 2: { ...trusted, ...run } });
    expect(await trustedQualityArtifact('123', '1', read, AbortSignal.timeout(1000))).toBeNull();
  });
  it('prefers the newest trusted artifact over a newer untrusted one with the same name', async () => {
    const read = github({ 3: { ...trusted, head_branch: 'feature' }, 2: trusted, 1: trusted }, [
      qualityArtifact(10, 1),
      qualityArtifact(30, 3),
      qualityArtifact(20, 2),
    ]);
    expect(await trustedQualityArtifact('123', '1', read, AbortSignal.timeout(1000))).toMatchObject(
      { id: 20 },
    );
  });
});

async function stage(
  referenceBytes: string,
  change: (f: ReturnType<typeof referenceQualityFixture>) => void = () => {},
) {
  const f = referenceQualityFixture();
  f.descriptor.cases[0].sha256 = await sha256(new Blob(['reference-video']));
  f.descriptor.cases[0].bytes = 'reference-video'.length;
  f.attachment.pairs[0].reference.media_sha256 = f.descriptor.cases[0].sha256;
  change(f);
  const descriptor = JSON.stringify(f.descriptor);
  f.attachment.references.descriptor_sha256 = await sha256(new Blob([descriptor]));
  const quality = JSON.stringify(f.attachment);
  const sums = `${await sha256(new Blob([descriptor]))}  h3-v2.json\n${await sha256(new Blob([quality]))}  quality.json\n`;
  vi.mocked(artifactFiles).mockResolvedValue(
    new Map([
      ['SHA256SUMS', encode(sums)],
      ['quality.json', encode(quality)],
      ['h3-v2.json', encode(descriptor)],
    ]),
  );
  vi.mocked(readStoredQuality).mockResolvedValue(null);
  vi.mocked(storeReferenceMedia).mockImplementation(async (_sha, name, download) => {
    await download();
    return `https://blob.test/${name}`;
  });
  fetchMock.mockResolvedValue(new Response(referenceBytes));
  return f.stored;
}

describe('quality publication', () => {
  it('stores the verified reference MP4 before the attachment, then reuses it on republish', async () => {
    const saved = await stage('reference-video');
    const stored = await publishVideoQuality(
      saved,
      github({ 2: trusted }),
      AbortSignal.timeout(1000),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/SemiAnalysisAI/InferenceX/releases/download/h3-v2-release-v1-references/drum-taps.mp4',
      expect.anything(),
    );
    expect(stored).toMatchObject({
      runId: '123',
      artifactId: 7,
      source: { artifactId: 20, workflowRunId: 2 },
      pairs: [{ psnrDb: 25, reference: { url: 'https://blob.test/drum-taps.mp4' } }],
      unreadable: false,
    });
    const read = github({ 2: trusted });
    vi.mocked(readStoredQuality).mockResolvedValue(stored);
    expect(await publishVideoQuality(saved, read, AbortSignal.timeout(1000))).toBe(stored);
    expect(read).not.toHaveBeenCalled();
    expect(storeVideoQuality).toHaveBeenCalledTimes(1);
  });
  it('stores nothing for an unreadable-only share, so a later score can still attach', async () => {
    const saved = await stage('reference-video', (f) => {
      f.attachment.pairs = [];
      f.attachment.unreadable.push({ run_id: '123', artifact_id: 7, error: 'KeyError' });
    });
    const read = github({ 2: trusted, 123: { run_attempt: 1 } });
    expect(await publishVideoQuality(saved, read, AbortSignal.timeout(1000))).toBeNull();
    expect(storeVideoQuality).not.toHaveBeenCalled();
  });
  it('reads quality from a later attempt for a bundle that was not rerun', async () => {
    const saved = await stage('reference-video');
    const read = github({ 2: trusted, 123: { run_attempt: 2 } }, [qualityArtifact(20, 2, 2)]);
    expect(await readTrustedQuality(saved, read, AbortSignal.timeout(1000))).toMatchObject({
      quality: { source: { name: 'h3-quality-123-2' }, pairs: [{ psnrDb: 25 }] },
    });
  });
  it('stores nothing when the release MP4 does not match the descriptor', async () => {
    const saved = await stage('tampered-video');
    await expect(
      publishVideoQuality(saved, github({ 2: trusted }), AbortSignal.timeout(1000)),
    ).rejects.toThrow('Reference media does not match its descriptor');
    expect(storeVideoQuality).not.toHaveBeenCalled();
  });
});
