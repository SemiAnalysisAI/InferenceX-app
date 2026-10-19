import type { ComponentType, ReactNode } from 'react';

export type NudgeTrigger =
  | { type: 'immediate' }
  | { type: 'timer'; delayMs: number }
  | {
      type: 'event';
      event: string;
      threshold?: number;
      delayMs?: number;
    }
  | {
      type: 'dom-event';
      event: string;
      selector?: string;
      threshold?: number;
      delayMs?: number;
    };

export type NudgeDismissal =
  | { type: 'session' }
  | { type: 'permanent' }
  | {
      type: 'timed';
      durationMs: number;
      cooldownStartsOnShow?: boolean;
    };

export interface NudgeCondition {
  check: () => boolean;
  listenEvent?: string;
}

export interface NudgeAction {
  label: string;
  labelZh?: string;
  icon?: ReactNode;
  onClick: (eventDetail?: unknown) => void;
}

export interface NudgeRenderContext {
  dismiss: () => void;
  titleId: string;
  descriptionId: string;
}

export interface NudgeAnchor {
  resolve: () => Element | null;
  getRect?: (element: Element) => DOMRect | null;
  getMutationRoot?: (element: Element | null) => Node | null;
  actionSelector?: string;
  repositionEvents?: readonly string[];
}

export interface NudgeContent {
  icon: ComponentType<{ className?: string }>;
  iconClassName?: string;
  title: string;
  titleZh?: string;
  description: string;
  descriptionZh?: string;
  action?: NudgeAction;
  testId?: string;

  renderContent?: (ctx: NudgeRenderContext) => ReactNode;

  dismissLabel?: string;
  dismissLabelZh?: string;
  hideDismissButton?: boolean;
  primaryAction?: NudgeAction;
  secondaryAction?: NudgeAction;
  containerClassName?: string;
  centered?: boolean;
  actionClassName?: string;
  badge?: string;
  badgeZh?: string;

  anchor?: NudgeAnchor;

  href?: string;
  onLinkClick?: () => void;
  linkLabel?: string;
  linkLabelZh?: string;
}

export interface NudgeAnalyticsOverrides {
  shown?: string;
  dismissed?: string;
  action?: string;
  properties?: Record<string, string>;
}

export type NudgeType = 'toast' | 'modal' | 'banner' | 'coach-mark';

export type NudgeScope = 'dashboard' | 'landing' | 'evaluation' | 'agentic-detail';

export interface NudgeDefinition {
  id: string;
  type: NudgeType;
  trigger: NudgeTrigger | NudgeTrigger[];
  dismissal: NudgeDismissal;
  storageKey: string;
  conditions?: NudgeCondition[];
  priority: number;
  scope: NudgeScope;
  renderOnInitialLoad?: boolean;

  schedule?: {
    showAfter?: string;
    hideAfter?: string;
  };

  permanentSuppressKey?: string;
  permanentSuppressEvent?: string;

  content: NudgeContent;

  dismissOnAction?: boolean;

  analytics?: NudgeAnalyticsOverrides;
}
