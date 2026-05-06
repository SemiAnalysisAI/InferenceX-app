import { isDismissed } from './persistence';
import { isWithinSchedule } from './scheduling';
import type { NudgeEntry } from './types';

interface ShouldShowOptions {
  pathname?: string;
  now?: number;
}

/**
 * Pure pre-flight check: would this nudge be allowed to show right now,
 * ignoring trigger semantics (mount/event)? Combines route match, persistence,
 * schedule, and the optional condition predicate.
 */
export function shouldShowNudge(entry: NudgeEntry, options: ShouldShowOptions = {}): boolean {
  const { pathname, now = Date.now() } = options;
  if (entry.routes && entry.routes.length > 0) {
    if (pathname === undefined) return false;
    if (!entry.routes.some((re) => re.test(pathname))) return false;
  }
  if (!isWithinSchedule(entry.schedule, now)) return false;
  if (isDismissed(entry.id, entry.persistence, now)) return false;
  if (entry.condition && !entry.condition()) return false;
  return true;
}
