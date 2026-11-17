import type { Locale } from '@/lib/i18n/i18n';
import { figures, usd } from './format';
import type { VideoPoint } from './metrics';
import type { ResultCell } from './results';

/** One part of the stage sentence: plain text, a side's color dot, or a fact set in bold. */
export type SentencePart = { text: string } | { dot: 'a' | 'b' } | { strong: string };

export interface SentenceSide {
  /** The hardware label the stage pill shows. */
  name: string;
  /** The chart point the side plays; null for the Diffusers reference. */
  point: VideoPoint | null;
  cost?: ResultCell['cost'];
}

/** "B200 ×4", its median latency per clip and its modelled cost per clip, as the readout rounds them. */
function facts(side: SentenceSide) {
  const seconds = side.point?.p50;
  const dollars = side.cost?.participating?.perVideo;
  if (!side.point || typeof seconds !== 'number' || typeof dollars !== 'number') return null;
  if (!Number.isFinite(seconds) || !Number.isFinite(dollars)) return null;
  const gpus = side.point.participating;
  return {
    label: typeof gpus === 'number' ? `${side.name} ×${gpus}` : side.name,
    seconds: `${figures(seconds)} s`,
    dollars: usd(dollars),
  };
}

/**
 * The one sentence under a phone's clip stage: what the two deployments on it cost in time and
 * money for a clip of this workload. These are each cell's median latency and modelled cost per
 * clip, not the time of the clip on screen. Null unless both sides are hardware deployments with
 * both figures, so the reference, a missing cost or an unmeasured cell never reads as a claim.
 */
export function stageSentence(
  locale: Locale,
  a: SentenceSide,
  b: SentenceSide,
): SentencePart[] | null {
  const subject = facts(a);
  const pair = facts(b);
  if (!subject || !pair) return null;
  return locale === 'zh'
    ? [
        { text: '相同的 prompt 和 seed。' },
        { dot: 'a' },
        { strong: subject.label },
        { text: ' 每条视频的延迟中位数为 ' },
        { strong: subject.seconds },
        { text: '，成本 ' },
        { strong: subject.dollars },
        { text: '；' },
        { dot: 'b' },
        { strong: pair.label },
        { text: ' 为 ' },
        { strong: pair.seconds },
        { text: '，成本 ' },
        { strong: pair.dollars },
        { text: '。' },
      ]
    : [
        { text: 'Same prompt, same seed. ' },
        { dot: 'a' },
        { strong: subject.label },
        { text: ' takes a median ' },
        { strong: subject.seconds },
        { text: ' per clip for ' },
        { strong: subject.dollars },
        { text: '; ' },
        { dot: 'b' },
        { strong: pair.label },
        { text: ' takes ' },
        { strong: pair.seconds },
        { text: ' for ' },
        { strong: pair.dollars },
        { text: '.' },
      ];
}

/** The sentence as plain text. */
export const sentenceText = (parts: readonly SentencePart[]) =>
  parts.map((part) => ('text' in part ? part.text : 'strong' in part ? part.strong : '')).join('');
