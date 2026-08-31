/**
 * Shared search matching for every search box on the site (selector
 * dropdowns, legend search, table search, command palette).
 *
 * Plain `label.toLowerCase().includes(query)` fails the moment a label
 * carries punctuation the user doesn't type: "B300 vllm" should match
 * "B300 (vLLM)" (#406). We normalize punctuation to spaces on BOTH sides
 * and require every query token to appear somewhere in the haystack, so
 * word order and bracket style never matter.
 */

/**
 * Punctuation that separates words in our labels: brackets, dashes, slashes,
 * dots, etc. Deliberately NOT `\W` — CJK characters are word characters for
 * us, and `\W` would strip them.
 */
const SEPARATORS = /[()[\]{}<>_\-–—/\\,.:;+&|"'`~!?@#$%^*=]+/g;

/** Lowercase, fold separator punctuation to spaces, collapse whitespace. */
export function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(SEPARATORS, ' ').replaceAll(/\s+/g, ' ').trim();
}

/** Normalized query tokens; empty array for blank/punctuation-only queries. */
export function searchTokens(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(' ') : [];
}

/**
 * True when every query token appears (as a substring) in the combined,
 * normalized haystack fields. An empty query matches everything, mirroring
 * the previous `if (!search) return all` behavior at every call site.
 */
export function matchesSearch(
  query: string,
  ...haystacks: readonly (string | null | undefined)[]
): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const haystack = haystacks
    .filter((h): h is string => Boolean(h))
    .map(normalizeSearchText)
    .join(' ');
  return tokens.every((token) => haystack.includes(token));
}
