/**
 * Tokenizer for the in-browser site search.
 *
 * Latin text is lower-cased, accent-folded, split on non-alphanumerics and
 * reduced with a small suffix stemmer so "benchmarks", "benchmarking" and
 * "benchmarked" share one term. Hardware and model identifiers keep their
 * digits ("mi355x", "gb200", "fp8"), and dotted versions are joined
 * ("v4.1" -> "v41", "k2.6" -> "k26") because that is how they appear in slugs.
 *
 * CJK runs have no word boundaries, so they are indexed as overlapping
 * character bigrams (plus the single character for one-character runs), the
 * standard dictionary-free approach for Chinese full-text search.
 */

const CJK_RANGE = /[\u3400-\u9FFF\uF900-\uFAFF]/u;
const TOKEN_PATTERN = /[\p{Script=Han}]+|[\p{L}\p{N}]+(?:\.[\p{N}]+)*/gu;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'which',
  'with',
]);

/** Light English suffix stripping; deliberately conservative for identifiers. */
export function stem(word: string): string {
  // Identifiers with digits (h100, fp8, gb300, 8k1k) are never stemmed.
  if (word.length <= 3 || /\d/u.test(word)) return word;
  let w = word;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('sses')) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) {
    w = w.slice(0, -1);
  }
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed')) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith('ation')) w = `${w.slice(0, -5)}ate`;
  else if (w.length > 4 && w.endsWith('ly')) w = w.slice(0, -2);
  return w;
}

function cjkBigrams(run: string): string[] {
  const chars = [...run];
  if (chars.length === 1) return chars;
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
  return out;
}

/**
 * Split text into normalized search terms. Stop words are dropped unless
 * `keepStopWords` is set (used for phrase snippets).
 */
export function tokenize(text: string, keepStopWords = false): string[] {
  const normalized = text
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036F]/gu, '')
    .toLowerCase();
  const out: string[] = [];
  for (const match of normalized.matchAll(TOKEN_PATTERN)) {
    const raw = match[0];
    if (CJK_RANGE.test(raw[0])) {
      out.push(...cjkBigrams(raw));
      continue;
    }
    const word = raw.replaceAll('.', '');
    if (!keepStopWords && STOP_WORDS.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

export function isCjkTerm(term: string): boolean {
  return CJK_RANGE.test(term[0] ?? '');
}
