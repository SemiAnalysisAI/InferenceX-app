/**
 * Persistent state for "user has starred the repo." Read by the header/footer
 * GitHub-star buttons and by nudges that should disappear once the user has
 * starred. The nudge framework owns its own *dismissal* storage — this module
 * only tracks the user's actual starring action.
 */
export const STARRED_KEY = 'inferencex-starred';
export const STARRED_EVENT = 'inferencex:starred';

export function saveStarred(): void {
  try {
    localStorage.setItem(STARRED_KEY, '1');
  } catch {
    // localStorage unavailable
  }
  window.dispatchEvent(new Event(STARRED_EVENT));
}
