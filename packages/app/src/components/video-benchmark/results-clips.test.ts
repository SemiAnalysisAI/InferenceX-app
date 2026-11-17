import { describe, expect, it } from 'vitest';
import type { CaseRecord } from './compare';
import { videoHistoryEntry, type VideoHistoryPage } from './history';
import { namedRunPoints } from './points';
import {
  absoluteFrameDifference,
  publishedResultsSide,
  resultsClipGroups,
  resultsClipReference,
  type ResultsClipSide,
} from './results-clips';
import { referenceQualityFixture } from './reference-quality.fixture';
import { withQuality } from './stored';
import { verifiedQuality } from './reference-quality';

const record = (changes: Partial<CaseRecord> = {}): CaseRecord => ({
  slotId: 'measurement-r001-c001',
  caseId: 'crane',
  prompt: 'A crane lifts off a frozen lake.',
  seed: 11,
  status: 'succeeded',
  valid: true,
  seconds: 120,
  mediaPath: 'artifacts/crane.mp4',
  ...changes,
});
const side = (
  hardwareKey: string,
  records: CaseRecord[],
  generationKey = 'same-workload',
): ResultsClipSide => ({
  pointId: hardwareKey,
  hardwareKey,
  generationKey,
  quality: new Map(),
  unscored: new Map(),
  records,
  media: new Map(
    records.flatMap((r) => {
      const url = `https://media.test/${hardwareKey}/${r.mediaPath}`;
      return r.mediaPath ? [[r.mediaPath, { url, downloadUrl: url }]] : [];
    }),
  ),
});

describe('results clip matching', () => {
  it('uses only explicit exact-bound reference pairs and hides the reference with its hardware', () => {
    const f = referenceQualityFixture();
    const path = f.attachment.pairs[0].candidate.media_path;
    f.stored.sources[0].assets = [[path, { url: '/candidate.mp4', downloadUrl: '/candidate.mp4' }]];
    const page: VideoHistoryPage = {
      schemaVersion: 1,
      nextPage: null,
      entries: [videoHistoryEntry(f.stored, null)],
    };
    const point = namedRunPoints([page], '123').find((item) => item.cell === 'c1')!;
    expect(publishedResultsSide(f.stored, point).quality.size).toBe(0);
    expect(() => publishedResultsSide(f.stored, { ...point, id: `missing:${point.cell}` })).toThrow(
      'Selected observation is not published',
    );
    expect(() => publishedResultsSide({ ...f.stored, runId: 'other' }, point)).toThrow(
      'Stored artifact identity mismatch',
    );
    const quality = verifiedQuality(f.attachment, f.descriptor, f.stored, '9'.repeat(64)).pairs;
    quality[0].reference.url = '/reference.mp4';
    f.stored.quality = quality;
    const [group] = resultsClipGroups([publishedResultsSide(f.stored, point)]);
    expect(group.clips.get('h200')?.quality?.psnrDb).toBe(25);
    expect(resultsClipReference(group, new Set())?.url).toBe('/reference.mp4');
    expect(resultsClipReference(group, new Set(['h200']))).toBeNull();
    quality[0].candidate.artifact_id = 8;
    expect(publishedResultsSide(f.stored, point).quality.size).toBe(0);
  });
  it('keeps an unpublished run clip with its PSNR or unscored reason but no media or reference', () => {
    const f = referenceQualityFixture();
    const page: VideoHistoryPage = {
      schemaVersion: 1,
      nextPage: null,
      entries: [videoHistoryEntry(f.stored, null)],
    };
    const point = namedRunPoints([page], '123').find((item) => item.cell === 'c1')!;
    expect(resultsClipGroups([publishedResultsSide(f.stored, point)])).toEqual([]);
    const pair = f.attachment.pairs[0];
    f.attachment.unscored.push({
      candidate: { ...pair.candidate, slot_id: 'measurement-r002-c001' },
      reason: 'no_reference',
      fields: [],
    });
    const live = withQuality(
      f.stored,
      verifiedQuality(f.attachment, f.descriptor, f.stored, '9'.repeat(64)),
    );
    const groups = resultsClipGroups([publishedResultsSide(live, point)]);
    expect(
      groups.map((group) => {
        const clip = group.clips.get('h200')!;
        return [group.take, clip.url, clip.quality?.psnrDb ?? null, clip.unscored?.reason ?? null];
      }),
    ).toEqual([
      [1, '', 25, null],
      [2, '', null, 'no_reference'],
    ]);
    expect(resultsClipReference(groups[0], new Set())).toBeNull();
    const unreadable = withQuality(f.stored, { pairs: [], unscored: [], unreadable: true });
    expect(
      resultsClipGroups([publishedResultsSide(unreadable, point)]).map(
        (group) => group.clips.get('h200')?.unscored?.reason,
      ),
    ).toEqual(['unreadable', 'unreadable', 'unreadable', 'unreadable']);
    // A published run hides a clip whose MP4 is not stored, as before quality existed.
    live.sources[0].assets = [
      [pair.candidate.media_path, { url: '/c.mp4', downloadUrl: '/c.mp4' }],
    ];
    expect(
      resultsClipGroups([publishedResultsSide(live, point)]).map((group) => group.take),
    ).toEqual([1]);
  });
  it('groups exact seeds and workloads by recorded take without shifting missing records', () => {
    const later = record({ slotId: 'measurement-r002-c001', seconds: 121 });
    const groups = resultsClipGroups([
      side('b200', [record(), later]),
      side('h200', [later]),
      side('mi355x', [record({ seed: 12 })]),
      side('gb200', [record()], 'other-workload'),
      side('h100', [record()], ''),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups[0].take).toBe(2);
    expect([...groups[0].clips.keys()]).toEqual(['b200', 'h200']);
    expect(groups[0].clips.get('h200')?.record.seconds).toBe(121);
    expect(groups.slice(1).every((group) => group.clips.size === 1)).toBe(true);
    expect(
      groups
        .slice(1)
        .flatMap((group) => [...group.clips.keys()])
        .sort(),
    ).toEqual(['b200', 'gb200', 'mi355x']);
  });
  it('never pairs a case ID without known prompt and seed, failed media or an unknown take', () => {
    const records = [
      record({ prompt: null }),
      record({ seed: null }),
      record({ valid: false }),
      record({ status: 'failed' }),
      record({ slotId: 'unknown' }),
      record({ mediaPath: null }),
    ];
    expect(resultsClipGroups([side('h200', records)])).toEqual([]);
  });
});

describe('absolute frame difference', () => {
  it('displays exact RGB differences with saturated amplification and an opaque alpha channel', () => {
    expect([
      ...absoluteFrameDifference(
        new Uint8ClampedArray([10, 20, 90, 1]),
        new Uint8ClampedArray([13, 10, 0, 0]),
      ),
    ]).toEqual([12, 40, 255, 255]);
    expect([
      ...absoluteFrameDifference(
        new Uint8ClampedArray([10, 20, 90, 1]),
        new Uint8ClampedArray([10, 20, 90, 0]),
      ),
    ]).toEqual([0, 0, 0, 255]);
    expect(() =>
      absoluteFrameDifference(new Uint8ClampedArray(4), new Uint8ClampedArray(8)),
    ).toThrow('Frame geometry mismatch');
  });
});
