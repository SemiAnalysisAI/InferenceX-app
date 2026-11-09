import { describe, expect, it } from 'vitest';
import { parseStage, promptKey, stagePrompt, stageSearch, stageSubject } from './clip-stage';
import type { CaseRecord } from './compare';
import type { VideoPoint } from './metrics';
import { resultsClipGroups, type ResultsClipSide } from './results-clips';

const record = (caseId: string, take = 1): CaseRecord => ({
  slotId: `measurement-r00${take}-c001`,
  caseId,
  prompt: `${caseId} prompt`,
  seed: 11,
  status: 'succeeded',
  valid: true,
  seconds: 120,
  mediaPath: `artifacts/${caseId}-${take}.mp4`,
});
const side = (hardwareKey: string, records: CaseRecord[], media = true): ResultsClipSide => ({
  pointId: hardwareKey,
  hardwareKey,
  generationKey: 'same-workload',
  quality: new Map(),
  // An unpublished run keeps its scored clips without media.
  unscored: new Map(records.map((r) => [r.slotId, { reason: 'no_reference', fields: [] }])),
  records,
  media: new Map(
    media
      ? records.map((r) => [r.mediaPath!, { url: `/${hardwareKey}.mp4`, downloadUrl: '' }])
      : [],
  ),
});
const point = (hardwareKey: string, runId = 'official') =>
  ({ id: hardwareKey, hardwareKey, runId }) as VideoPoint;

describe('clip stage', () => {
  it('rewrites only its own URL keys and reads an unknown view as Wipe', () => {
    const search = stageSearch(
      { prompt: 'crane', view: 'wipe', clip: null },
      '?r_y=videosPerGpuHour&r_view=side&r_clip=1:old',
    );
    expect(Object.fromEntries(search)).toEqual({ r_y: 'videosPerGpuHour', r_prompt: 'crane' });
    expect(parseStage('?r_view=zoom&r_prompt=')).toEqual({
      prompt: null,
      view: 'wipe',
      clip: null,
    });
    const clip = stageSearch({ prompt: null, view: 'side', clip: '34341996789:abc:c1' }, '');
    expect(parseStage(`?${clip}`)).toEqual({
      prompt: null,
      view: 'side',
      clip: '34341996789:abc:c1',
    });
  });

  it('leads with the named run, skips clipless hardware, and waits for a preferred side', () => {
    const official = { point: point('b200'), side: side('b200', [record('crane')]) };
    const clipless = { point: point('b200'), side: side('b200', [record('crane')], false) };
    const h200 = { point: point('h200'), side: side('h200', [record('crane')]) };
    expect(stageSubject([clipless, h200])?.point.hardwareKey).toBe('h200');
    // The named run is the subject on any hardware, with or without media.
    const unpublished = { ...clipless, point: point('b200', 'named') };
    expect(stageSubject([unpublished, h200], 'named')?.point).toBe(unpublished.point);
    const namedH200 = { ...h200, point: point('h200', 'named') };
    expect(stageSubject([official, namedH200], 'named')?.point).toBe(namedH200.point);
    // A clicked chart point outranks the named run.
    expect(stageSubject([official, namedH200], 'named', 'official:b200')?.point).toBe(
      official.point,
    );
    expect(stageSubject([{ point: point('b200'), side: undefined }, h200])).toMatchObject({
      point: { hardwareKey: 'b200' },
      pending: true,
    });
    expect(stageSubject([clipless])?.groups).toHaveLength(1);
  });

  it('keeps each take of a prompt addressable and falls back to the first prompt', () => {
    const groups = resultsClipGroups([side('b200', [record('crane'), record('crane', 2)])]);
    expect(groups.map(promptKey)).toEqual(['crane', 'crane~2']);
    expect(stagePrompt(groups, 'crane~2')?.take).toBe(2);
    expect(stagePrompt(groups, 'gone')).toBe(groups[0]);
  });
});
