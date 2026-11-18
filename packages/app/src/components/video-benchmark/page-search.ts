/**
 * The page's settings as a query string, kept in memory the way the inference charts keep theirs
 * (`url-state.ts`). They live as long as the document: a language switch or a visit to another
 * tab keeps them, and a reload starts again from the address bar. A link seeds them, the controls
 * rewrite them and Share reads them back. The address bar stays as the link wrote it; only the
 * open deployment (`r_point`) is shown there, so Back closes it.
 */
let search = '';
/** The link the settings were read from; null until the document's first read. */
let link: string | null = null;
const listeners = new Set<() => void>();

/** Keys the page itself puts in or takes out of the address bar; they do not make a link new. */
const OWN_KEY = /^(?:r_point|unofficialruns?)$/iu;

/**
 * Reads the address bar when it shows a link the settings were not read from. Coming back to the
 * page without one, or with the same one, keeps what is in memory.
 */
export function readVideoLink() {
  const params = new URLSearchParams(window.location.search);
  const next = `${new URLSearchParams([...params].filter(([key]) => !OWN_KEY.test(key)))}`;
  if (link !== null && (next === '' || next === link)) return;
  link = next;
  setVideoSearch(params);
}

export function videoSearch() {
  // The stage reads its settings in render, before the page's first effect.
  if (link === null && typeof window !== 'undefined') readVideoLink();
  return search;
}

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
