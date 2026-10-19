import type { NudgeDismissal } from './types';

export function isDismissed(storageKey: string, strategy: NudgeDismissal): boolean {
  try {
    if (strategy.type === 'session') {
      return sessionStorage.getItem(storageKey) !== null;
    }
    const value = localStorage.getItem(storageKey);
    if (value === null) return false;
    if (strategy.type === 'permanent') return true;
    const dismissedAt = Number(value);
    if (Number.isNaN(dismissedAt)) return false;
    return Date.now() - dismissedAt < strategy.durationMs;
  } catch {
    return false;
  }
}

function writeCooldownAnchor(storageKey: string, strategy: NudgeDismissal): void {
  try {
    if (strategy.type === 'session') {
      sessionStorage.setItem(storageKey, '1');
    } else if (strategy.type === 'permanent') {
      localStorage.setItem(storageKey, '1');
    } else {
      localStorage.setItem(storageKey, String(Date.now()));
    }
  } catch {}
}

export function markShown(storageKey: string, strategy: NudgeDismissal): void {
  if (strategy.type === 'session' || (strategy.type === 'timed' && strategy.cooldownStartsOnShow)) {
    writeCooldownAnchor(storageKey, strategy);
  }
}

export function markDismissed(storageKey: string, strategy: NudgeDismissal): void {
  writeCooldownAnchor(storageKey, strategy);
}

export function clearDismissal(storageKey: string, strategy: NudgeDismissal): void {
  try {
    if (strategy.type === 'session') {
      sessionStorage.removeItem(storageKey);
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {}
}

export function isPermanentlySuppressed(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function markPermanentlySuppressed(key: string, event?: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {}
  if (event) {
    window.dispatchEvent(new Event(event));
  }
}

export function isWithinSchedule(schedule?: { showAfter?: string; hideAfter?: string }): boolean {
  if (!schedule) return true;
  const now = Date.now();
  if (schedule.showAfter && now < new Date(schedule.showAfter).getTime()) return false;
  if (schedule.hideAfter && now >= new Date(schedule.hideAfter).getTime()) return false;
  return true;
}
