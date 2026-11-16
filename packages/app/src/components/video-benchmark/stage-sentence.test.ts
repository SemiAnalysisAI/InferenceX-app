import { describe, expect, it } from 'vitest';

import type { VideoPoint } from './metrics';
import type { ResultCell } from './results';
import { sentenceText, stageSentence, type SentenceSide } from './stage-sentence';

const cost = (perVideo: number | null): ResultCell['cost'] =>
  ({
    participating:
      perVideo === null ? null : { perVideo, perVideoSecond: perVideo / 5, perHour: 1 },
    allocated: null,
  }) as ResultCell['cost'];
const side = (
  name: string,
  p50: number | null,
  perVideo: number | null,
  gpus = 4,
): SentenceSide => ({
  name,
  point: { hardwareKey: name.toLowerCase(), p50, participating: gpus } as VideoPoint,
  cost: cost(perVideo),
});

describe('stageSentence', () => {
  const b200 = side('B200', 35.42, 0.06817);
  const h200 = side('H200', 71.68, 0.09712);

  it('states each cell’s median latency and cost per clip, rounded as the readout rounds them', () => {
    const parts = stageSentence('en', b200, h200)!;
    expect(sentenceText(parts)).toBe(
      'Same prompt, same seed. B200 ×4 takes a median 35.4 s per clip for $0.0682; H200 ×4 takes 71.7 s for $0.0971.',
    );
    // Each side's dot comes right before its name.
    expect(
      parts.flatMap((part, index) => ('dot' in part ? [[part.dot, parts[index + 1]]] : [])),
    ).toEqual([
      ['a', { strong: 'B200 ×4' }],
      ['b', { strong: 'H200 ×4' }],
    ]);
    expect(sentenceText(parts)).not.toMatch(/made|this clip/u);
  });

  it('reads the same in Chinese', () => {
    expect(sentenceText(stageSentence('zh', b200, h200)!)).toBe(
      '相同的 prompt 和 seed。B200 ×4 每条视频的延迟中位数为 35.4 s，成本 $0.0682；H200 ×4 为 71.7 s，成本 $0.0971。',
    );
  });

  it('says nothing against the reference or without both figures on both sides', () => {
    expect(stageSentence('en', b200, { name: 'Diffusers reference', point: null })).toBeNull();
    expect(stageSentence('en', b200, side('H200', null, 0.09))).toBeNull();
    expect(stageSentence('en', b200, side('H200', 71.7, null))).toBeNull();
    expect(stageSentence('en', side('B200', 35.4, null), h200)).toBeNull();
    expect(stageSentence('en', b200, { ...h200, cost: undefined })).toBeNull();
  });
});
