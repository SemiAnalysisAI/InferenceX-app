import type { NudgeSchedule } from './types';

/**
 * Whether `now` falls inside the nudge's [showAfter, hideAfter] window.
 * Either bound is optional. Invalid ISO strings are treated as "no bound" so
 * a typo in the registry doesn't silently disable a nudge.
 */
export function isWithinSchedule(
  schedule: NudgeSchedule | undefined,
  now: number = Date.now(),
): boolean {
  if (!schedule) return true;
  if (schedule.showAfter) {
    const t = Date.parse(schedule.showAfter);
    if (!Number.isNaN(t) && now < t) return false;
  }
  if (schedule.hideAfter) {
    const t = Date.parse(schedule.hideAfter);
    if (!Number.isNaN(t) && now >= t) return false;
  }
  return true;
}
