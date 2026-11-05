function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function matchesSearch(text: string, query: string): boolean {
  return normalizeSearchText(text).includes(normalizeSearchText(query));
}
