export const STARRED_KEY = 'inferencex-starred';
export const STARRED_EVENT = 'inferencex:starred';
export const DISMISS_KEY = 'inferencex-star-modal-dismissed';
export const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export function saveStarred(): void {
  try {
    localStorage.setItem(STARRED_KEY, '1');
  } catch {
    // localStorage unavailable
  }
  window.dispatchEvent(new Event(STARRED_EVENT));
}

export function saveDismissTimestamp(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable
  }
}
