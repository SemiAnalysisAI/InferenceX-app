export function videoView(view: string | string[] | undefined, hasRun: boolean) {
  const requested = (Array.isArray(view) ? view[0] : view) ?? (hasRun ? 'results' : 'history');
  return requested === 'history' || requested === 'tradeoff' ? requested : 'results';
}
