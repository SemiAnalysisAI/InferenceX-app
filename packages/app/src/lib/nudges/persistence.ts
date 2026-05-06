import type { NudgePersistence } from './types';

export const STORAGE_PREFIX = 'inferencex-nudge:';

export function dismissalKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getStorage(persistence: NudgePersistence): StorageLike | null {
  try {
    // Reference globals directly (rather than via `window`) so unit tests can
    // stub `localStorage` / `sessionStorage` with `vi.stubGlobal` in a node env.
    return persistence.kind === 'session' ? sessionStorage : localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether a nudge is currently considered dismissed under its persistence
 * policy. `forever` and `session` are simple flags; `cooldown` is a timestamp
 * that expires after `durationMs`.
 */
export function isDismissed(
  id: string,
  persistence: NudgePersistence,
  now: number = Date.now(),
): boolean {
  const storage = getStorage(persistence);
  if (!storage) return false;
  try {
    const value = storage.getItem(dismissalKey(id));
    if (!value) return false;
    if (persistence.kind === 'cooldown') {
      const dismissedAt = Number(value);
      if (Number.isNaN(dismissedAt)) return false;
      return now - dismissedAt < persistence.durationMs;
    }
    return true;
  } catch {
    // Treat storage-read failures as "dismissed" to fail closed and avoid
    // re-showing a nudge that the user may have actually dismissed.
    return true;
  }
}

/** Mark a nudge dismissed under its persistence policy. */
export function markDismissed(
  id: string,
  persistence: NudgePersistence,
  now: number = Date.now(),
): void {
  const storage = getStorage(persistence);
  if (!storage) return;
  try {
    const value = persistence.kind === 'cooldown' ? String(now) : '1';
    storage.setItem(dismissalKey(id), value);
  } catch {
    // Storage unavailable — the nudge will reappear next mount, but that's
    // safer than silently breaking the page.
  }
}

/** Forget the dismissal so the nudge can be re-shown. */
export function clearDismissal(id: string, persistence: NudgePersistence): void {
  const storage = getStorage(persistence);
  if (!storage) return;
  try {
    storage.removeItem(dismissalKey(id));
  } catch {
    // ignore
  }
}
