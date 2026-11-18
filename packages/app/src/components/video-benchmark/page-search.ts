/**
 * The page's settings as a query string, kept in memory the way the inference charts keep theirs
 * (`url-state.ts`). The link the page opens on seeds it, the controls rewrite it and Share reads
 * it back. The address bar stays as the link wrote it; only the open deployment (`r_point`) is
 * shown there, so Back closes it.
 */
let search = '';
const listeners = new Set<() => void>();

export const videoSearch = () => search;

export function setVideoSearch(params: URLSearchParams) {
  const next = params.toString();
  if (next === search) return;
  search = next;
  for (const listener of listeners) listener();
}

export function subscribeVideoSearch(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
