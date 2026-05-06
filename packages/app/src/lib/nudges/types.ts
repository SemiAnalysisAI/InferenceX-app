import type { ReactNode } from 'react';

/**
 * Surface a nudge renders on. The framework picks a different visual treatment
 * (and z-index slot) per kind, but every kind shares the same registry, trigger,
 * persistence, and analytics machinery.
 */
export type NudgeKind = 'toast' | 'modal' | 'banner';

/**
 * When a nudge becomes eligible to show. `mount` and `mount-delay` fire as soon
 * as the relevant route is mounted; `event` waits for one or more `window`
 * CustomEvents (with optional per-event count thresholds, e.g. show after the
 * second tab change).
 */
export interface NudgeTriggerEvent {
  /** Event name (CustomEvent or DOM event). */
  name: string;
  /** How many times the event must fire before the nudge becomes eligible. */
  threshold?: number;
  /** Where to listen — `window` for app-level CustomEvents, `document` for DOM events like `copy`. */
  target?: 'window' | 'document';
  /**
   * Only count an event if its `target` element (or any ancestor) matches this
   * CSS selector. Useful for DOM events where you want to scope to a specific
   * affordance (e.g. copy events on chart tooltips only).
   */
  selector?: string;
}

export type NudgeTrigger =
  | { kind: 'mount' }
  | { kind: 'mount-delay'; delayMs: number }
  | {
      kind: 'event';
      events: NudgeTriggerEvent[];
      /** Optional delay applied after the threshold is met before showing. */
      afterDelayMs?: number;
    };

/**
 * How to remember a "this user has dismissed it" decision.
 *
 *  - `session`: sessionStorage — re-shows next browser session.
 *  - `forever`: localStorage flag — never shows again on this browser.
 *  - `cooldown`: localStorage timestamp — re-shows after `durationMs` elapses.
 */
export type NudgePersistence =
  | { kind: 'session' }
  | { kind: 'forever' }
  | { kind: 'cooldown'; durationMs: number };

/** Optional time window when the nudge is allowed to show. */
export interface NudgeSchedule {
  /** ISO 8601 timestamp — only show on/after this date. */
  showAfter?: string;
  /** ISO 8601 timestamp — stop showing after this date. */
  hideAfter?: string;
}

/** Context passed to render callbacks and action handlers. */
export interface NudgeContext {
  id: string;
  /** Custom-event detail object for event triggers, otherwise undefined. */
  triggerDetail: unknown;
  /** Hide the nudge and persist the dismissal per the registered policy. */
  dismiss: () => void;
}

export interface NudgeAction {
  label: string;
  icon?: ReactNode;
  /** External URL or in-app path. Mutually exclusive with `onClick`. */
  href?: string;
  /** Open `href` in a new tab. */
  target?: '_blank';
  /** Use Next.js client-side navigation for in-app paths. */
  inApp?: boolean;
  /** Click handler for the primary action. */
  onClick?: (ctx: NudgeContext) => void;
  /** If true, do not auto-dismiss after the action runs. Default: dismiss. */
  keepOpenAfterAction?: boolean;
}

export interface NudgeContent {
  icon: ReactNode;
  title: string;
  description: string;
  /** Primary CTA. Banners require this; toasts/modals may omit it. */
  primaryAction?: NudgeAction;
  /** Optional badge label rendered next to the title (e.g. "New"). */
  badge?: string;
}

export interface NudgeEntry {
  /** Stable id — used for analytics props and dismissal storage keys. */
  id: string;
  kind: NudgeKind;
  trigger: NudgeTrigger;
  persistence: NudgePersistence;
  /**
   * When the dismissal record is written.
   *
   *  - `'show'`: the moment the nudge becomes visible. Refreshing mid-display
   *    will not re-show it. This is the default for toasts so they appear at
   *    most once per session/cooldown.
   *  - `'dismiss'`: only when the user actively dismisses or invokes the
   *    primary action. The default for modals and banners — they're meant to
   *    persist until the user resolves them.
   */
  persistOn?: 'show' | 'dismiss';
  /**
   * Routes (matched against `pathname`) where this nudge is allowed to fire.
   * If omitted, allowed everywhere.
   */
  routes?: RegExp[];
  schedule?: NudgeSchedule;
  /** Higher number wins when multiple nudges of the same kind want a slot. */
  priority?: number;
  /** Extra runtime check evaluated alongside persistence. */
  condition?: () => boolean;
  /**
   * Window CustomEvent names that should hide the nudge immediately *without*
   * persisting a dismissal (the underlying state has already changed — e.g. the
   * star-modal hides when the user actually stars the repo).
   */
  externalDismissEvents?: string[];
  /**
   * Render callback. Re-runs whenever `triggerDetail` changes so a closure
   * captured here can read fresh detail (e.g. the gradient-label nudge picks up
   * `detail.enableGradient` from the most recent event).
   */
  render: (ctx: NudgeContext) => NudgeContent;
}
