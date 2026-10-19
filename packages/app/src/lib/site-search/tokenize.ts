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

export function stem(word: string): string {
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
