const REF = /^[1-9]\d{0,19}\.[1-9]\d{0,19}$/;

export function comparisonRefs(value: string | null): string[] {
  const refs = [...new Set(value ? value.split(',') : [])];
  if (refs.length > 8 || refs.some((ref) => !REF.test(ref)))
    throw new Error('A comparison needs at most 8 valid CI run/artifact pairs');
  return refs;
}

export function rememberComparison(url: URL, run: string, artifact: string): URL {
  const previous = [url.searchParams.get('run'), url.searchParams.get('artifact')].join('.');
  const refs = comparisonRefs(
    [
      ...comparisonRefs(url.searchParams.get('compare')),
      ...(REF.test(previous) ? [previous] : []),
      `${run}.${artifact}`,
    ].join(','),
  );
  if (refs.length > 1) url.searchParams.set('compare', refs.join(','));
  return url;
}
