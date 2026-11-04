import type { FrontierOvertake } from '../frontier-history-core';

export interface FrontierMeme {
  id: string;
  src: string;
  alt: string;
  caption: string;
}

export interface MemeContext {
  overtake: FrontierOvertake;
  winnerLabel: string;
  loserLabel: string;
  locale: 'en' | 'zh';
}

const STRINGS = {
  en: (winner: string, loser: string, range: string) =>
    `${winner} took ${range} tok/s/user from ${loser}`,
  zh: (winner: string, loser: string, range: string) =>
    `${winner} 从 ${loser} 手中拿下 ${range} tok/s/user`,
} as const;

/** Jensen's "congrats, happy for you, nice", the first time in a run another vendor overtakes NVIDIA. */
export function pickMeme({ overtake, winnerLabel, loserLabel, locale }: MemeContext): FrontierMeme {
  const from = Math.round(overtake.from);
  const to = Math.round(overtake.to);
  const range = from === to ? `${from}` : `${from}–${to}`;
  return {
    id: `${overtake.date}:${overtake.winner}:${overtake.from}`,
    src: '/decorative/frontier-memes/jensen-congrats-happy-for-you-nice.webp',
    alt: 'Congrats, happy for you, nice',
    caption: STRINGS[locale](winnerLabel, loserLabel, range),
  };
}
