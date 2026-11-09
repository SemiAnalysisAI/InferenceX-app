import { describe, expect, it } from 'vitest';
import type { CaseRecord } from './compare';
import type { DiagnosticPair } from './diagnostic-quality';
import type { VideoPoint } from './metrics';
import { referencePsnrRange, showMeTarget } from './quality-method';
import type { ClipQuality } from './reference-quality';
import type { ResultsClipSide } from './results-clips';

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
const point = (hardwareKey: string, lossy = false) =>
  ({
    id: hardwareKey,
    hardwareKey,
    runId: 'official',
    results: lossy ? lossyResults : undefined,
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
    const lead = (hardwareKey: string, referenceUrl: string, lossy = false) => ({
      point: point(hardwareKey, lossy),
      side: side(hardwareKey, [[record('crane'), pair('measured', 20, referenceUrl)]]),
    });
    const h100 = lead('h100', '/reference.mp4');
    const h200 = lead('h200', '/reference.mp4');
    expect(showMeTarget([h100, h200, lead('b200', '/reference.mp4')])?.hardwareKey).toBe('b200');
    // An unpublished reference cannot play; a lossy lead is no lossless example.
    expect(showMeTarget([h100, h200, lead('b200', '')])).toBe(h200.point);
    expect(showMeTarget([h100, lead('b200', '/reference.mp4', true)])).toBe(h100.point);
    expect(showMeTarget([lead('b200', '')])).toBeNull();
  });
});
