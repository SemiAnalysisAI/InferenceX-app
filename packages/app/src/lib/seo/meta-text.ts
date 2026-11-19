/** ZH copy mixes CJK with Latin SKUs and units, so it gets more characters than pure CJK (~80). */
export const META_DESCRIPTION_MAX = { en: 155, zh: 120 } as const;

/** Title budget before the ` | InferenceX` suffix, keeping the full title within ~60 characters. */
export const META_TITLE_MAX = 47;

/** First candidate within META_TITLE_MAX; otherwise the last (shortest) candidate cut with an ellipsis. */
export function fitMetaTitle(candidates: readonly string[]): string {
  const fit = candidates.find((c) => c.length <= META_TITLE_MAX);
  if (fit !== undefined) return fit;
  const last = candidates.at(-1) ?? '';
  return `${last.slice(0, META_TITLE_MAX - 1).trimEnd()}…`;
}

const ZH_SENTENCE_END = /[。！？；]/u;

/**
 * Shortens a meta description to `max` characters without cutting a word (EN) and,
 * when possible, at the end of a sentence. Text that already fits is returned unchanged.
 */
export function clampMetaDescription(text: string, locale: 'en' | 'zh'): string {
  const max = META_DESCRIPTION_MAX[locale];
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;

  const window = trimmed.slice(0, max);
  const sentenceEnd =
    locale === 'zh'
      ? Math.max(...[...window].map((ch, i) => (ZH_SENTENCE_END.test(ch) ? i : -1)))
      : window.lastIndexOf('. ');
  if (sentenceEnd >= max / 2) return trimmed.slice(0, sentenceEnd + 1);

  if (locale === 'zh') return `${trimmed.slice(0, max - 1).replace(/[，、：\s]+$/u, '')}…`;
  const lastSpace = trimmed.slice(0, max).lastIndexOf(' ');
  const cut = lastSpace > 0 ? trimmed.slice(0, lastSpace) : trimmed.slice(0, max - 1);
  return `${cut.replace(/[\s,;:–—-]+$/u, '')}…`;
}
