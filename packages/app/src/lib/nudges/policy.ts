import type { NudgeDefinition } from './types';

/**
 * Should clicking the action button persist a dismissal and clear the nudge?
 *
 * Toast/modal default to `true` — engaging the CTA satisfies the nudge's
 * goal, so it shouldn't keep nagging. Banner defaults to `false` — its
 * action is a navigation, and the banner stays visible until the page
 * transitions.
 *
 * Either default can be overridden per-nudge via `dismissOnAction`.
 */
export function dismissesOnAction(def: NudgeDefinition): boolean {
  return def.dismissOnAction ?? def.type !== 'banner';
}
