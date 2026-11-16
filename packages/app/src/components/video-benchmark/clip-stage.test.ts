import { describe, expect, it } from 'vitest';
import {
  pairedGroup,
  parseStage,
  phonePairing,
  promptKey,
  speedVs,
  stagePrompt,
  stageSearch,
  stageSubject,
  type StageOption,
} from './clip-stage';
import type { CaseRecord } from './compare';
import type { DiagnosticPair } from './diagnostic-quality';
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
      { prompt: 'crane', view: 'wipe', clip: null, vs: null, swap: false, sheet: null },
      '?r_y=videosPerGpuHour&r_view=side&r_clip=1:old&r_vs=h200&r_swap=1',
    );
    expect(Object.fromEntries(search)).toEqual({ r_y: 'videosPerGpuHour', r_prompt: 'crane' });
    expect(parseStage('?r_view=zoom&r_prompt=')).toEqual({
      prompt: null,
      view: 'wipe',
      clip: null,
      vs: null,
      swap: false,
      sheet: null,
    });
    const clip = stageSearch(
      {
        prompt: null,
        view: 'side',
        clip: '34341996789:abc:c1',
        vs: null,
        swap: false,
        sheet: null,
      },
      '',
    );
    expect(parseStage(`?${clip}`)).toEqual({
      prompt: null,
      view: 'side',
      clip: '34341996789:abc:c1',
      vs: null,
      swap: false,
      sheet: null,
    });
  });

  it('keeps the compared side and a swap in the URL and leaves their defaults out', () => {
    const pair = stageSearch(
      { prompt: null, view: 'wipe', clip: '1:b200:c1', vs: 'h200', swap: true, sheet: null },
      '?r_y=videosPerGpuHour',
    );
    expect(pair.toString()).toBe('r_y=videosPerGpuHour&r_clip=1%3Ab200%3Ac1&r_vs=h200&r_swap=1');
    expect(parseStage(`?${pair}`)).toMatchObject({
      clip: '1:b200:c1',
      vs: 'h200',
      swap: true,
      sheet: null,
    });
    // Only `1` swaps, so a hand-edited value cannot leave the sides in an unknown order.
    expect(parseStage('?r_swap=true&r_vs=')).toMatchObject({ vs: null, swap: false, sheet: null });
  });

  it('keeps the point whose sheet is open in the URL', () => {
    const opened = stageSearch(
      { prompt: null, view: 'wipe', clip: null, vs: null, swap: false, sheet: '1:b200:c1' },
      '?r_y=videosPerGpuHour',
    );
    expect(opened.toString()).toBe('r_y=videosPerGpuHour&r_sheet=1%3Ab200%3Ac1');
    expect(parseStage(`?${opened}`).sheet).toBe('1:b200:c1');
    expect(stageSearch(parseStage(''), `?${opened}`).has('r_sheet')).toBe(false);
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

  it('reads speed from seconds per clip in the right direction and leaves a missing p50 unmeasured', () => {
    expect(speedVs(10, 28)).toEqual({ direction: 'faster', times: '2.80' });
    expect(speedVs(28, 10)).toEqual({ direction: 'slower', times: '2.80' });
    expect(speedVs(7, 20)).toEqual({ direction: 'faster', times: '2.86' });
    expect(speedVs(10, 10.04)).toEqual({ direction: 'same', times: '1.00' });
    expect(speedVs(null, 28)).toBeNull();
    expect(speedVs(10, 0)).toBeNull();
  });

  it('keeps each take of a prompt addressable and falls back to the first prompt', () => {
    const groups = resultsClipGroups([side('b200', [record('crane'), record('crane', 2)])]);
    expect(groups.map(promptKey)).toEqual(['crane', 'crane~2']);
    expect(stagePrompt(groups, 'crane~2')?.take).toBe(2);
    expect(stagePrompt(groups, 'gone')).toBe(groups[0]);
  });

  it('finds the other GPU’s clip of a matched-noise rerun, whose attachment differs per GPU', () => {
    const rerun = (hardwareKey: string, attachmentSha256: string): ResultsClipSide => ({
      ...side(hardwareKey, [record('crane')]),
      diagnostics: [
        {
          attachmentSha256,
          candidate: {
            url: `/${hardwareKey}-rerun.mp4`,
            case_id: 'crane',
            prompt: 'crane prompt',
            seed: 11,
          },
        } as unknown as DiagnosticPair,
      ],
    });
    const [subject] = resultsClipGroups([rerun('b200', 'a'.repeat(64))]);
    const other = resultsClipGroups([rerun('h200', 'b'.repeat(64))]);
    expect(pairedGroup(other, subject)?.clips.get('h200')?.url).toBe('/h200-rerun.mp4');
    const [ci] = resultsClipGroups([side('b200', [record('crane')])]);
    expect(pairedGroup(other, ci)?.scope).toBeUndefined();
  });
});

/** A stored 4-GPU SGLang cell of one workload, as `phonePairing` compares them. */
const cell = (hardwareKey: string, p50: number | null, patch: Partial<VideoPoint> = {}) =>
  ({
    id: hardwareKey,
    hardwareKey,
    runId: 'official',
    workload: 'h3',
    participating: 4,
    p50,
    publishedAt: '2026-11-01T00:00:00.000Z',
    results: { engine: 'sglang' },
    ...patch,
  }) as VideoPoint;
const offered = (...points: VideoPoint[]): StageOption[] => [
  { value: 'reference', kind: 'reference', point: null },
  ...points.map((item) => ({
    value: item.hardwareKey ?? '',
    kind: 'hardware' as const,
    point: item,
  })),
];

describe('phonePairing', () => {
  const b200 = cell('b200', 35.4);

  it('opens against the slowest other GPU on the same workload, engine and GPU count', () => {
    const options = offered(cell('mi355x', 54.7), cell('h200', 71.7), cell('h100', 74.2));
    expect(phonePairing(b200, options)).toBe('h100');
    expect(phonePairing(b200, offered(cell('mi355x', 54.7), cell('h200', 71.7)))).toBe('h200');
  });

  it('skips deployments that are not like for like or have no clips', () => {
    const options = offered(
      cell('h100', 74.2, { participating: 8 }),
      cell('h200', 71.7, { results: { engine: 'vllm-omni' } } as Partial<VideoPoint>),
      cell('mi355x', 99, { workload: 'wan' }),
      cell('b300', 80, { publishedAt: null } as Partial<VideoPoint>),
      cell('gb200', null),
      cell('b200', 90),
    );
    expect(phonePairing(b200, options)).toBeNull();
    // The caller can rule a candidate out once its read shows no clips.
    const two = offered(cell('h200', 71.7), cell('h100', 74.2));
    expect(phonePairing(b200, two, (item) => item.hardwareKey !== 'h100')).toBe('h200');
  });

  it('keeps the usual default with one hardware or only the reference on offer', () => {
    expect(phonePairing(b200, offered())).toBeNull();
    const twin: StageOption[] = [{ value: 'twin', kind: 'twin', point: cell('h200', 71.7) }];
    expect(phonePairing(b200, twin)).toBeNull();
  });
});
