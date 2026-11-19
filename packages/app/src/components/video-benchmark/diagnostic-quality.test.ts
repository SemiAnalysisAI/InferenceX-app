import { describe, expect, it } from 'vitest';
import { verifiedDiagnosticPairs } from './diagnostic-quality';
import { diagnosticQualityFixture } from './diagnostic-quality.fixture';
import { publishedResultsSide, resultsClipEvidence, resultsClipGroups } from './results-clips';
import { videoHistoryEntry, type VideoHistoryPage } from './history';
import { namedRunPoints } from './points';

const verify = (f: ReturnType<typeof diagnosticQualityFixture>) =>
  verifiedDiagnosticPairs(f.attachment, f.receipts, [f.original.stored], 'f'.repeat(64));

describe('independent matched-noise diagnostic clips', () => {
  it('keeps native media and PSNR separate from the original CI cohort and source identity', () => {
    const f = diagnosticQualityFixture();
    const before = JSON.stringify(videoHistoryEntry(f.original.stored, null));
    const [pair] = verify(f);
    expect(pair.origin.media_sha256).toBe(f.attachment.pairs[0].origin.media_sha256);
    expect(pair.candidate.media_sha256).toBe(f.candidate.media.sha256);
    expect(pair.candidate.run_id).toBe('native-candidate');
    expect(pair.psnrDb).toBe(25);
    expect(JSON.stringify(pair)).not.toContain('/private/');
    pair.candidate.url = '/native.mp4';
    pair.reference.url = '/native-reference.mp4';
    f.original.stored.diagnostics = [pair];
    expect(JSON.stringify(videoHistoryEntry(f.original.stored, null))).toBe(before);
    const path = f.attachment.pairs[0].origin.media_path;
    f.original.stored.sources[0].assets = [[path, { url: '/old.mp4', downloadUrl: '/old.mp4' }]];
    const page: VideoHistoryPage = {
      schemaVersion: 1,
      nextPage: null,
      entries: [videoHistoryEntry(f.original.stored, null)],
    };
    const point = namedRunPoints([page], '123').find((p) => p.cell === 'c1')!;
    const side = publishedResultsSide(f.original.stored, point);
    const groups = resultsClipGroups([side]);
    expect(groups).toHaveLength(2);
    expect(groups[0].scope).toBe('matched-noise-diagnostic');
    expect(groups[0].clips.get('h200')?.url).toBe('/native.mp4');
    expect(groups[0].clips.get('h200')?.record.seconds).toBeNull();
    expect(groups[1].clips.get('h200')?.url).toBe('/old.mp4');
    const evidence = resultsClipEvidence([side]);
    expect(evidence[0].clips[0]).toMatchObject({
      pointId: null,
      contextPointId: point.id,
      slotId: null,
    });
    expect(evidence[1].clips[0].pointId).toBe(point.id);
  });

  it.each([
    'origin media',
    'consumed noise',
    'missing rank',
    'topology',
    'schedule',
    'reference role',
    'plan case',
  ])('rejects %s mismatch', (defect) => {
    const f = diagnosticQualityFixture();
    if (defect === 'origin media') f.attachment.pairs[0].origin.media_sha256 = '0'.repeat(64);
    if (defect === 'consumed noise') f.candidate.ranks[2].audio_raw_sha256 = '0'.repeat(64);
    if (defect === 'missing rank') f.candidate.ranks.pop();
    if (defect === 'topology') f.candidate.topology.ulysses_degree = 4;
    if (defect === 'schedule') f.reference.schedule.video.sigmas[1] = 0.1;
    if (defect === 'reference role') f.reference.role = 'candidate';
    if (defect === 'plan case') f.candidate.seed = 12;
    expect(() => verify(f)).toThrow();
  });

  it('rejects duplicate original bindings rather than replacing their media', () => {
    const f = diagnosticQualityFixture();
    f.attachment.pairs.push(structuredClone(f.attachment.pairs[0]));
    expect(() => verify(f)).toThrow();
  });

  it('pairs two native hardware reruns only with matching effective settings and harness', () => {
    const f = diagnosticQualityFixture('b200');
    const other = diagnosticQualityFixture('h100', 8, 'b'.repeat(64));
    other.attachment.pairs[0].candidate.receipt_sha256 = 'e'.repeat(64);
    f.receipts.set('e'.repeat(64), other.candidate);
    f.attachment.pairs.push(other.attachment.pairs[0]);
    const read = () =>
      verifiedDiagnosticPairs(
        f.attachment,
        f.receipts,
        [f.original.stored, other.original.stored],
        'f'.repeat(64),
      );
    expect(read().map((pair) => pair.candidate.hardware_key)).toEqual(['b200', 'h100']);
    other.candidate.effective_settings_sha256 = '0'.repeat(64);
    expect(read).toThrow('matched candidate controls');
    other.candidate.effective_settings_sha256 = f.candidate.effective_settings_sha256;
    other.candidate.harness_sha256 = '0'.repeat(64);
    expect(read).toThrow('matched candidate controls');
  });
});
