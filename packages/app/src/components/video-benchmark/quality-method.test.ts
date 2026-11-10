import { describe, expect, it } from 'vitest';
import type { CaseRecord } from './compare';
import type { DiagnosticPair } from './diagnostic-quality';
import type { VideoPoint } from './metrics';
import { referencePsnrRange, seeChangesPair, showMeTarget } from './quality-method';
import type { ClipQuality } from './reference-quality';
import type { ResultsClipSide } from './results-clips';
import type { ResultsEvidence } from './results-evidence';

const SLOTS = ['crane', 'dock', 'fog', 'gate', 'hill'];
const record = (caseId: string, valid = true): CaseRecord => ({
  slotId: `measurement-r001-c00${SLOTS.indexOf(caseId) + 1}`,
  caseId,
  prompt: `${caseId} prompt`,
  seed: 11,
  status: 'succeeded',
  valid,
  seconds: 120,
  mediaPath: `artifacts/${caseId}.mp4`,
});
const pair = (
  status: ClipQuality['status'],
  psnrDb: number | null,
  referenceUrl = '/reference.mp4',
): ClipQuality => ({ status, psnrDb, reference: { url: referenceUrl } }) as unknown as ClipQuality;
/** One clip per case; a case without a pair is listed unscored. */
const side = (
  hardwareKey: string,
  cases: [CaseRecord, ClipQuality | null][],
  diagnostics: DiagnosticPair[] = [],
): ResultsClipSide => ({
  pointId: hardwareKey,
  hardwareKey,
  generationKey: 'same-workload',
  records: cases.map(([r]) => r),
  media: new Map(cases.map(([r]) => [r.mediaPath!, { url: `/${r.caseId}.mp4`, downloadUrl: '' }])),
  quality: new Map(cases.flatMap(([r, q]) => (q ? [[r.slotId, q] as const] : []))),
  unscored: new Map(
    cases.flatMap(([r, q]) =>
      q ? [] : [[r.slotId, { reason: 'no_reference' as const, fields: [] }] as const],
    ),
  ),
  diagnostics,
});
const lossyResults = { engine: 'sglang', optimizations: ['first-block-cache'] };
const point = (hardwareKey: string, lossy = false, runId = 'official') =>
  ({
    id: hardwareKey,
    hardwareKey,
    runId,
    results: lossy ? lossyResults : undefined,
  }) as unknown as VideoPoint;

const lead = (hardwareKey: string, referenceUrl: string, lossy = false, runId = 'official') => ({
  point: point(hardwareKey, lossy, runId),
  side: side(hardwareKey, [[record('crane'), pair('measured', 20, referenceUrl)]]),
});
const cell = (id: string, runId: string, lossy: boolean, publishedAt: string | null = 'x') =>
  ({
    id,
    runId,
    hardwareKey: 'b200',
    workloadKey: 'w',
    concurrency: 1,
    participating: 4,
    replicas: 1,
    server: { tp: 2, ulysses: 2, attention: null },
    results: (lossy ? lossyResults : { engine: 'sglang' }) as unknown as ResultsEvidence,
    publishedAt,
  }) as unknown as VideoPoint;

describe('quality method', () => {
  it('ranges reference PSNR over lossless CI clips with a finite score only', () => {
    const rerun = {
      ...pair('measured', 50),
      scope: 'matched-noise-diagnostic',
      attachmentSha256: 'a'.repeat(64),
      candidate: { url: '/rerun.mp4', case_id: 'crane', prompt: 'crane prompt', seed: 11 },
    } as unknown as DiagnosticPair;
    const b200 = side(
      'b200',
      [
        [record('crane'), pair('measured', 20.04)],
        [record('dock'), pair('identical', null)],
        [record('fog'), pair('incompatible', null)],
        [record('gate'), null],
        [record('hill', false), pair('measured', 40)],
      ],
      [rerun],
    );
    const leads = [
      { point: point('b200'), side: b200 },
      { point: point('h100', true), side: side('h100', [[record('crane'), pair('measured', 5)]]) },
      { point: point('h200'), side: side('h200', [[record('crane'), pair('measured', 12.84)]]) },
      { point: point('mi355x'), side: undefined },
    ];
    expect(referencePsnrRange(leads)).toEqual({
      min: 12.84,
      max: 20.04,
      clips: 2,
      hardware: ['b200', 'h200'],
    });
    expect(referencePsnrRange(leads.slice(1, 2))).toBeNull();
  });

  it('shows B200 against its reference, else the first lossless lead that has one', () => {
    const h100 = lead('h100', '/reference.mp4');
    const h200 = lead('h200', '/reference.mp4');
    const b200 = lead('b200', '/reference.mp4');
    expect(showMeTarget([h100, h200, b200])?.hardwareKey).toBe('b200');
    // An unpublished reference cannot play; a lossy lead is no lossless example.
    expect(showMeTarget([h100, h200, lead('b200', '')])).toBe(h200.point);
    expect(showMeTarget([h100, lead('b200', '/reference.mp4', true)])).toBe(h100.point);
    // As on the stage, the named run's lead goes first, whatever its hardware.
    const named = lead('h100', '/reference.mp4', false, 'named');
    expect(showMeTarget([named, h200, b200], 'named')).toBe(named.point);
  });

  it('pairs a lossy cell with its own run’s twin, preferring the named run, only when both have clips', () => {
    const options = { tier: 'h' } as const;
    const officialLossy = cell('official-lossy', 'official', true);
    const officialTwin = cell('official-twin', 'official', false);
    const namedLossy = cell('named-lossy', 'named', true);
    const namedTwin = cell('named-twin', 'named', false);
    // The named run's lossy cell never borrows the official run's twin.
    expect(seeChangesPair([officialLossy, namedLossy], [officialTwin], options, 'named')).toEqual({
      lossy: officialLossy,
      twin: officialTwin,
    });
    expect(
      seeChangesPair([officialLossy, namedLossy], [officialTwin, namedTwin], options, 'named'),
    ).toEqual({ lossy: namedLossy, twin: namedTwin });
    const liveTwin = cell('live-twin', 'named', false, null);
    expect(seeChangesPair([namedLossy], [liveTwin], options, 'named')).toBeNull();
  });
});
