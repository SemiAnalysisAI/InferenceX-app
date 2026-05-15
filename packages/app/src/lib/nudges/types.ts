import type { ComponentType, ReactNode } from 'react';

export type NudgeTrigger =
  | { type: 'immediate' }
  | { type: 'timer'; delayMs: number }
  | {
      type: 'event';
      event: string;
      /** Show after the event fires this many times (default 1). */
      threshold?: number;
      /** Delay (ms) between threshold being met and the nudge appearing. */
      delayMs?: number;
    }
  | {
      type: 'dom-event';
      /** Native DOM event name (e.g. 'copy'). */
      event: string;
      /** CSS selector — only count events whose target matches. */
      selector?: string;
      threshold?: number;
      /** Delay (ms) between threshold being met and the nudge appearing. */
      delayMs?: number;
    };

export type NudgeDismissal =
  | { type: 'session' }
  | { type: 'permanent' }
  | {
      type: 'timed';
      durationMs: number;
      /**
       * When true the cooldown timer starts at first show, giving a
       * "remind every N" cadence (the nudge re-appears after `durationMs`
       * regardless of whether the user dismissed it). When false (the default)
       * the timer starts on user dismissal — the nudge is "snoozed for N".
       */
      cooldownStartsOnShow?: boolean;
    };

export interface NudgeCondition {
  check: () => boolean;
  /** Re-evaluate when this window event fires. */
  listenEvent?: string;
}

export interface NudgeAction {
  label: string;
  icon?: ReactNode;
  /**
   * Called when the user clicks the action button.
   * For event-triggered nudges the trigger's CustomEvent detail is forwarded
   * so the handler can access runtime data without a special case in the engine.
   */
  onClick: (eventDetail?: unknown) => void;
}

export interface NudgeRenderContext {
  dismiss: () => void;
}

export interface NudgeContent {
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  title: string;
  description: string;
  action?: NudgeAction;
  /** data-testid on the nudge container (preserves existing selectors). */
  testId?: string;

  /** Escape hatch (modals): replaces the default body. Engine still renders chrome + X. */
  renderContent?: (ctx: NudgeRenderContext) => ReactNode;

  // -- Modal-specific (ignored by toasts/banners) --

  /** Label for the dismiss button (default "Maybe Later"). */
  dismissLabel?: string;
  /** Label + handler for the primary CTA (modals only). */
  primaryAction?: NudgeAction;
  /** Extra CSS class on the modal container (e.g. branded border). */
  containerClassName?: string;
  /** Extra CSS class on the primary action button (e.g. glow effect). */
  actionClassName?: string;
  /** Badge text rendered next to the title (e.g. "New"). */
  badge?: string;

  // -- Banner-specific (ignored by toasts/modals) --

  /** href for the banner link (the whole banner is clickable). */
  href?: string;
  /** Called when the banner link is clicked (for analytics). */
  onLinkClick?: () => void;
}

// ---------------------------------------------------------------------------
// Analytics overrides
// ---------------------------------------------------------------------------

export interface NudgeAnalyticsOverrides {
  shown?: string;
  dismissed?: string;
  action?: string;
  /** Extra properties attached to every analytics event for this nudge. */
  properties?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// NudgeDefinition — a single registry entry
// ---------------------------------------------------------------------------

export type NudgeType = 'toast' | 'modal' | 'banner';

export interface NudgeDefinition {
  id: string;
  type: NudgeType;
  trigger: NudgeTrigger | NudgeTrigger[];
  dismissal: NudgeDismissal;
  /** localStorage / sessionStorage key for dismissal state. */
  storageKey: string;
  conditions?: NudgeCondition[];
  /** Higher priority wins when multiple nudges are eligible simultaneously. */
  priority: number;
  /** Which NudgeEngine instance manages this nudge. */
  scope: 'dashboard' | 'landing' | 'evaluation';

  // Scheduling (time-bound campaigns)
  schedule?: {
    showAfter?: string;
    hideAfter?: string;
  };

  /**
   * A secondary localStorage key that permanently suppresses the nudge.
   * Example: `inferencex-starred` suppresses both star-nudge and github-star-modal.
   */
  permanentSuppressKey?: string;
  /**
   * Window event that triggers a permanent-suppress write + immediate hide.
   * Example: `inferencex:starred`, `inferencex:eval-samples-opened`.
   */
  permanentSuppressEvent?: string;

  content: NudgeContent;

  /**
   * When the action button is clicked, should the nudge be persisted as
   * dismissed and visually cleared? Defaults to `true` for `toast`/`modal`
   * (action = engagement) and `false` for `banner` (banner action navigates;
   * leaving it visible avoids a flash before the page transition completes).
   */
  dismissOnAction?: boolean;

  /** Override default `{id}_shown` / `{id}_dismissed` / `{id}_action` event names. */
  analytics?: NudgeAnalyticsOverrides;
}
