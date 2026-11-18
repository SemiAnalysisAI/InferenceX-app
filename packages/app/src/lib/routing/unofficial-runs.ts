/** Existing links use both spellings and mixed case. New links use unofficialruns. */
export const isUnofficialRunParam = (key: string) => /^unofficialruns?$/iu.test(key);

export function readUnofficialRunParam(params: URLSearchParams): string | null {
  for (const [key, value] of params) if (value && isUnofficialRunParam(key)) return value;
  return null;
}

export function deleteUnofficialRunParams(params: URLSearchParams): void {
  const aliases = [...params.keys()].filter(isUnofficialRunParam);
  for (const key of aliases) params.delete(key);
}

export function parseUnofficialRunIds(search: string): string[] {
  const value = readUnofficialRunParam(new URLSearchParams(search));
  if (!value) return [];
  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return [...new Set(ids.map((id) => (/^\d+$/u.test(id) ? id.replace(/^0+(?=\d)/u, '') : id)))];
}
