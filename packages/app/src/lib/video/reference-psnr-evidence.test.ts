import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/video-runs/route';
import { videoHistoryEntry } from '@/components/video-benchmark/history';
import { verifiedQuality } from '@/components/video-benchmark/reference-quality';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { loadReferencePsnrEvidence, REFERENCE_PSNR_RUN_ID } from './reference-psnr-evidence';

vi.mock('@/app/api/video-runs/route', () => ({ GET: vi.fn() }));
afterEach(() => vi.resetAllMocks());

/** One published artifact of the pinned run whose single clip scores 25 dB. */
function published(artifactId: number, hardware: string, manifestSha256: string) {
  const f = referenceQualityFixture(4, REFERENCE_PSNR_RUN_ID, artifactId, manifestSha256, hardware);
  f.stored.quality = verifiedQuality(f.attachment, f.descriptor, f.stored, '9'.repeat(64)).pairs;
  return f.stored;
}

const B200 = published(7, 'NVIDIA B200', 'a'.repeat(64));
const H100 = published(8, 'NVIDIA H100', 'b'.repeat(64));
/** Published but never approved for the dashboard. */
const H200 = published(9, 'NVIDIA H200', 'c'.repeat(64));

/** B200 also carries a second cell, which must not draw a second B200 row. */
const entry = (saved: typeof B200) => {
  const history = { ...videoHistoryEntry(saved, null), approved: saved !== H200 };
  const [source] = history.sources;
  if (saved === B200)
    source.observations.push({ ...source.observations[0], id: 'second-cell', concurrency: 2 });
  return history;
};

/** History newest first: the pinned run's B200 artifact has aged past the first window. */
function respond(query: URLSearchParams, failing?: number) {
  if (query.get('format') === 'history')
    return Response.json(
      query.get('page') === '1'
        ? { schemaVersion: 1, nextPage: 6, entries: [H100, H200].map(entry) }
        : { schemaVersion: 1, nextPage: null, entries: [entry(B200)] },
    );
  const id = Number(query.get('artifact'));
  if (id === failing) return new Response(null, { status: 503 });
  return Response.json([B200, H100, H200].find((saved) => saved.artifact.id === id));
}

function serve({ failing }: { failing?: number } = {}) {
  vi.mocked(GET).mockImplementation((request) =>
    Promise.resolve(respond(request.nextUrl.searchParams, failing)),
  );
}

const drum = { caseId: 'drum-taps', prompt: 'A drummer taps a snare drum.', psnrDb: 25 };

describe('reference PSNR evidence', () => {
  it('reads the pinned run’s approved published scores from every History page, one entry per GPU', async () => {
    serve();
    expect(await loadReferencePsnrEvidence()).toEqual({
      runId: REFERENCE_PSNR_RUN_ID,
      hardware: [
        { hardwareKey: 'b200', scores: [drum] },
        { hardwareKey: 'h100', scores: [drum] },
      ],
    });
  });

  it('shows no scores, instead of failing the page, when one published read fails', async () => {
    serve({ failing: 8 });
    expect(await loadReferencePsnrEvidence()).toEqual({
      runId: REFERENCE_PSNR_RUN_ID,
      hardware: null,
    });
  });
});
