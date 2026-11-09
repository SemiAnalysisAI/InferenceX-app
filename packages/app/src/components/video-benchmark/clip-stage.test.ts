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
const point = (hardwareKey: string) => ({ id: hardwareKey, hardwareKey }) as VideoPoint;

describe('clip stage', () => {
  it('rewrites only its own URL keys and reads an unknown view as Wipe', () => {
    const search = stageSearch(
      { prompt: 'crane', view: 'wipe' },
      '?r_y=videosPerGpuHour&r_view=side',
    );
    expect(Object.fromEntries(search)).toEqual({ r_y: 'videosPerGpuHour', r_prompt: 'crane' });
    expect(parseStage('?r_view=zoom&r_prompt=')).toEqual({ prompt: null, view: 'wipe' });
  });

  it('skips hidden and clipless hardware but waits for a preferred side still loading', () => {
    const h200 = { point: point('h200'), side: side('h200', [record('crane')]) };
    const unpublished = { point: point('b200'), side: side('b200', [record('crane')], false) };
    expect(stageSubject([unpublished, h200], new Set())?.point.hardwareKey).toBe('h200');
    expect(
      stageSubject(
        [{ point: point('b200'), side: side('b200', [record('crane')]) }, h200],
        new Set(['b200']),
      )?.point.hardwareKey,
    ).toBe('h200');
    expect(
      stageSubject([{ point: point('b200'), side: undefined }, h200], new Set()),
    ).toMatchObject({
      point: { hardwareKey: 'b200' },
      pending: true,
    });
    expect(stageSubject([unpublished], new Set())?.groups).toHaveLength(1);
  });

  it('keeps each take of a prompt addressable and falls back to the first prompt', () => {
    const groups = resultsClipGroups([side('b200', [record('crane'), record('crane', 2)])]);
    expect(groups.map(promptKey)).toEqual(['crane', 'crane~2']);
    expect(stagePrompt(groups, 'crane~2')?.take).toBe(2);
    expect(stagePrompt(groups, 'gone')).toBe(groups[0]);
  });
});
