import { describe, expect, it } from 'vitest';
import history from '../../../cypress/fixtures/api/video-history.json';
import type { CaseRecord } from './compare';
import type { VideoHistoryPage } from './history';
import { videoPoints } from './points';
import {
  absoluteFrameDifference,
  publishedResultsSide,
  resultsClipGroups,
  type ResultsClipSide,
} from './results-clips';
import { servingFixture } from './serving.fixture';
import type { StoredArtifact } from './stored';

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
  h200FiftyStepReference: hardwareKey === 'h200',
  records,
  urls: new Map(
    records.flatMap((r) =>
      r.mediaPath ? [[r.mediaPath, `https://media.test/${hardwareKey}/${r.mediaPath}`]] : [],
    ),
  ),
});

function fixture() {
  const point = videoPoints([history as unknown as VideoHistoryPage]).find(
    (p) => p.hardwareKey === 'h200' && p.concurrency === 1,
  )!;
  const data = servingFixture(point.runId);
  data.documents.set('manifest.json', data.manifest);
  data.documents.set('ci.json', data.ci);
  data.checksums.set('manifest.json', point.id.split(':')[0]);
  const saved: StoredArtifact = {
    storageVersion: 1,
    runId: point.runId,
    artifact: {
      id: point.artifactId,
      name: 'h3-video',
      expired: false,
      size_in_bytes: 1,
      stored: true,
    },
    sources: [
      {
        id: point.runId,
        documents: [...data.documents],
        checksums: [...data.checksums],
        assets: [],
        texts: [],
      },
    ],
  };
  return { point, saved };
}

describe('results clip matching', () => {
  it('matches a recorded take without shifting after an earlier missing record', () => {
    const later = record({ slotId: 'measurement-r002-c001', seconds: 121 });
    const groups = resultsClipGroups([side('b200', [record(), later]), side('h200', [later])]);
    expect(groups[0].take).toBe(2);
    expect([...groups[0].clips.keys()]).toEqual(['b200', 'h200']);
    expect(groups[0].clips.get('h200')?.record.seconds).toBe(121);
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
  it('keeps changed seeds, workloads and generations in separate groups', () => {
    const groups = resultsClipGroups([
      side('b200', [record()]),
      side('h200', [record({ seed: 12 })]),
      side('mi355x', [record()], 'other-workload'),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.clips.size === 1)).toBe(true);
    expect(resultsClipGroups([side('b200', [record()], '')])).toEqual([]);
  });
  it('accepts only the selected manifest and recognizes the sealed H200 H3 50-step plan', () => {
    const { point, saved } = fixture();
    expect(publishedResultsSide(saved, point).h200FiftyStepReference).toBe(true);
    const other = { ...point, id: `missing:${point.cell}` };
    expect(() => publishedResultsSide(saved, other)).toThrow(
      'Selected observation is not published',
    );
    expect(
      publishedResultsSide(saved, { ...point, hardwareKey: 'b200' }).h200FiftyStepReference,
    ).toBe(false);
    expect(() => publishedResultsSide({ ...saved, runId: 'other' }, point)).toThrow(
      'Stored artifact identity mismatch',
    );
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
