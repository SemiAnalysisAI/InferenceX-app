export const STARRED_KEY = 'inferencex-starred';
export const STARRED_EVENT = 'inferencex:starred';

export function saveStarred(): void {
  try {
    localStorage.setItem(STARRED_KEY, '1');
  } catch {}
  window.dispatchEvent(new Event(STARRED_EVENT));
}
