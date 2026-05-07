'use client';

import { ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import {
  isDismissed,
  isPermanentlySuppressed,
  isWithinSchedule,
  markDismissed,
} from '@/lib/nudges/persistence';
import { NUDGE_REGISTRY } from '@/lib/nudges/registry';
import type { NudgeDefinition, NudgeTrigger } from '@/lib/nudges/types';
import { BottomToast } from '@/components/ui/bottom-toast';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trackNudgeEvent(def: NudgeDefinition, event: 'shown' | 'dismissed' | 'action'): void {
  const name = def.analytics?.[event] ?? `${def.id}_${event}`;
  track(name, def.analytics?.properties);
}

function isEligible(def: NudgeDefinition): boolean {
  if (!isWithinSchedule(def.schedule)) return false;
  if (def.permanentSuppressKey && isPermanentlySuppressed(def.permanentSuppressKey)) return false;
  if (isDismissed(def.storageKey, def.dismissal)) return false;
  if (def.conditions?.some((c) => !c.check())) return false;
  return true;
}

// ---------------------------------------------------------------------------
// NudgeEngine
// ---------------------------------------------------------------------------

interface NudgeEngineProps {
  scope: 'dashboard' | 'landing' | 'evaluation';
}

/**
 * Two independent slots:
 *  - **banner** — inline content (one at a time)
 *  - **overlay** — toasts and modals (one at a time)
 *
 * A banner and an overlay can be visible simultaneously because they
 * occupy different visual layers.
 */
export function NudgeEngine({ scope }: NudgeEngineProps) {
  const scopeNudges = useMemo(() => NUDGE_REGISTRY.filter((n) => n.scope === scope), [scope]);

  const [activeBannerId, setActiveBannerId] = useState<string | null>(null);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const bannerShownRef = useRef(false);
  const overlayShownRef = useRef(false);

  const triggerCountsRef = useRef<Record<string, number>>({});
  const eventDetailRef = useRef<Record<string, unknown> | null>(null);
  const sessionDismissedRef = useRef<Set<string>>(new Set());

  const activeBanner = activeBannerId ? scopeNudges.find((n) => n.id === activeBannerId) : null;
  const activeOverlay = activeOverlayId ? scopeNudges.find((n) => n.id === activeOverlayId) : null;

  const showNudge = useCallback((def: NudgeDefinition) => {
    if (sessionDismissedRef.current.has(def.id)) return;
    if (!isEligible(def)) return;

    if (def.type === 'banner') {
      if (bannerShownRef.current) return;
      bannerShownRef.current = true;
      markDismissed(def.storageKey, def.dismissal);
      setActiveBannerId(def.id);
    } else {
      if (overlayShownRef.current) return;
      overlayShownRef.current = true;
      markDismissed(def.storageKey, def.dismissal);
      setActiveOverlayId(def.id);
    }
    trackNudgeEvent(def, 'shown');
  }, []);

  const dismissBanner = useCallback(() => {
    if (!activeBanner) return;
    trackNudgeEvent(activeBanner, 'dismissed');
    sessionDismissedRef.current.add(activeBanner.id);
    setActiveBannerId(null);
    bannerShownRef.current = false;
  }, [activeBanner]);

  const dismissOverlay = useCallback(() => {
    if (!activeOverlay) return;
    trackNudgeEvent(activeOverlay, 'dismissed');
    sessionDismissedRef.current.add(activeOverlay.id);
    setActiveOverlayId(null);
    overlayShownRef.current = false;
  }, [activeOverlay]);

  const handleBannerAction = useCallback(() => {
    if (!activeBanner) return;
    trackNudgeEvent(activeBanner, 'action');
    activeBanner.content.onLinkClick?.();
    sessionDismissedRef.current.add(activeBanner.id);
    setActiveBannerId(null);
    bannerShownRef.current = false;
  }, [activeBanner]);

  const handleOverlayAction = useCallback(() => {
    if (!activeOverlay) return;
    trackNudgeEvent(activeOverlay, 'action');
    const detail = eventDetailRef.current ?? undefined;

    if (activeOverlay.type === 'toast') {
      activeOverlay.content.action?.onClick(detail);
    } else if (activeOverlay.type === 'modal') {
      activeOverlay.content.primaryAction?.onClick(detail);
    }

    sessionDismissedRef.current.add(activeOverlay.id);
    setActiveOverlayId(null);
    overlayShownRef.current = false;
  }, [activeOverlay]);

  // -------------------------------------------------------------------------
  // Trigger setup
  // -------------------------------------------------------------------------

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    const sorted = [...scopeNudges].toSorted((a, b) => b.priority - a.priority);

    for (const def of sorted) {
      if (!isEligible(def)) continue;
      if (sessionDismissedRef.current.has(def.id)) continue;

      const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];

      for (const trigger of triggers) {
        const cleanup = setupTrigger(trigger, def, showNudge, triggerCountsRef, eventDetailRef);
        if (cleanup) cleanups.push(cleanup);
      }
    }

    return () => {
      for (const fn of cleanups) fn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBannerId, activeOverlayId, scope]);

  // -------------------------------------------------------------------------
  // Permanent suppress event listener
  // -------------------------------------------------------------------------

  useEffect(() => {
    const handlers: [string, () => void][] = [];

    for (const def of scopeNudges) {
      if (!def.permanentSuppressEvent) continue;

      const handler = () => {
        if (def.type === 'banner' && activeBannerId === def.id) {
          setActiveBannerId(null);
          bannerShownRef.current = false;
        } else if (activeOverlayId === def.id) {
          setActiveOverlayId(null);
          overlayShownRef.current = false;
        }
        sessionDismissedRef.current.add(def.id);
        if (def.permanentSuppressKey) {
          try {
            localStorage.setItem(def.permanentSuppressKey, '1');
          } catch {
            // Storage unavailable.
          }
        }
      };
      window.addEventListener(def.permanentSuppressEvent, handler);
      handlers.push([def.permanentSuppressEvent, handler]);
    }

    return () => {
      for (const [event, handler] of handlers) {
        window.removeEventListener(event, handler);
      }
    };
  }, [activeBannerId, activeOverlayId, scopeNudges]);

  // -------------------------------------------------------------------------
  // Render — banner and overlay can coexist
  // -------------------------------------------------------------------------

  return (
    <>
      {activeBanner && (
        <BannerRenderer
          def={activeBanner}
          onDismiss={dismissBanner}
          onAction={handleBannerAction}
        />
      )}
      {activeOverlay?.type === 'toast' && (
        <ToastRenderer
          def={activeOverlay}
          onDismiss={dismissOverlay}
          onAction={handleOverlayAction}
        />
      )}
      {activeOverlay?.type === 'modal' && (
        <ModalRenderer
          def={activeOverlay}
          onDismiss={dismissOverlay}
          onAction={handleOverlayAction}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Trigger setup — returns a cleanup function
// ---------------------------------------------------------------------------

function setupTrigger(
  trigger: NudgeTrigger,
  def: NudgeDefinition,
  showNudge: (def: NudgeDefinition) => void,
  countsRef: React.RefObject<Record<string, number>>,
  eventDetailRef: React.RefObject<Record<string, unknown> | null>,
): (() => void) | null {
  const triggerKey = `${def.id}:${trigger.type}:${'event' in trigger ? trigger.event : ''}`;

  if (trigger.type === 'immediate') {
    showNudge(def);
    return null;
  }

  if (trigger.type === 'timer') {
    const timer = window.setTimeout(() => showNudge(def), trigger.delayMs);
    return () => window.clearTimeout(timer);
  }

  if (trigger.type === 'event') {
    const threshold = trigger.threshold ?? 1;
    const delayTimers = new Set<number>();
    const handler = (e: Event) => {
      if (!countsRef.current) return;
      countsRef.current[triggerKey] = (countsRef.current[triggerKey] ?? 0) + 1;
      if (e instanceof CustomEvent && e.detail) {
        eventDetailRef.current = e.detail;
      }
      if (countsRef.current[triggerKey] >= threshold) {
        if (trigger.delayMs) {
          const t = window.setTimeout(() => showNudge(def), trigger.delayMs);
          delayTimers.add(t);
        } else {
          showNudge(def);
        }
      }
    };
    window.addEventListener(trigger.event, handler);
    return () => {
      window.removeEventListener(trigger.event, handler);
      for (const t of delayTimers) window.clearTimeout(t);
    };
  }

  if (trigger.type === 'dom-event') {
    const threshold = trigger.threshold ?? 1;
    const delayTimers = new Set<number>();
    const handler = (e: Event) => {
      if (trigger.selector) {
        const target = e.target as HTMLElement | null;
        if (!target?.closest(trigger.selector)) return;
      }
      if (!countsRef.current) return;
      countsRef.current[triggerKey] = (countsRef.current[triggerKey] ?? 0) + 1;
      if (countsRef.current[triggerKey] >= threshold) {
        if (trigger.delayMs) {
          const t = window.setTimeout(() => showNudge(def), trigger.delayMs);
          delayTimers.add(t);
        } else {
          showNudge(def);
        }
      }
    };
    document.addEventListener(trigger.event, handler);
    return () => {
      document.removeEventListener(trigger.event, handler);
      for (const t of delayTimers) window.clearTimeout(t);
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function ToastRenderer({
  def,
  onDismiss,
  onAction,
}: {
  def: NudgeDefinition;
  onDismiss: () => void;
  onAction: () => void;
}) {
  const { content } = def;
  const Icon = content.icon;
  return (
    <BottomToast
      testId={content.testId}
      icon={<Icon className={content.iconClassName} />}
      title={content.title}
      description={content.description}
      action={
        content.action
          ? {
              label: content.action.label,
              icon: content.action.icon,
              onClick: onAction,
            }
          : undefined
      }
      onDismiss={onDismiss}
    />
  );
}

function ModalRenderer({
  def,
  onDismiss,
  onAction,
}: {
  def: NudgeDefinition;
  onDismiss: () => void;
  onAction: () => void;
}) {
  const { content } = def;
  const Icon = content.icon;
  const idPrefix = def.id;

  return (
    <aside
      data-testid={content.testId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${idPrefix}-title`}
      aria-describedby={`${idPrefix}-description`}
      className={`fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md rounded-lg border bg-background p-6 shadow-lg ${content.containerClassName ?? ''}`}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5 pr-6">
          <h2 id={`${idPrefix}-title`} className="flex items-center gap-2 text-lg font-semibold">
            <Icon className={`size-5 ${content.iconClassName ?? ''}`} />
            {content.title}
            {content.badge && (
              <span className="ml-1 inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                {content.badge}
              </span>
            )}
          </h2>
          <p id={`${idPrefix}-description`} className="text-sm text-muted-foreground">
            {content.description}
          </p>
        </div>
        <div className="flex flex-row justify-end gap-2">
          <Button
            variant="outline"
            onClick={onDismiss}
            data-testid={content.testId ? `${content.testId}-dismiss` : undefined}
          >
            {content.dismissLabel ?? 'Maybe Later'}
          </Button>
          {content.primaryAction && (
            <Button
              onClick={onAction}
              data-testid={content.testId ? `${content.testId}-action` : undefined}
              className={content.actionClassName}
            >
              {content.primaryAction.icon}
              {content.primaryAction.label}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

function BannerRenderer({
  def,
  onDismiss,
  onAction,
}: {
  def: NudgeDefinition;
  onDismiss: () => void;
  onAction: () => void;
}) {
  const { content } = def;
  const Icon = content.icon;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onAction();
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDismiss();
  };

  return (
    <section className="container mx-auto px-4 lg:px-8 mb-6 lg:mb-4">
      <a
        href={content.href ?? '#'}
        onClick={handleClick}
        className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-brand/40 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-4 py-3 transition-all duration-200 hover:border-brand/70 hover:shadow-lg hover:shadow-brand/10"
        data-testid={content.testId}
      >
        <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-transparent via-brand/10 to-transparent" />
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Icon className="size-4 animate-pulse" />
        </span>
        <div className="relative flex flex-1 flex-col sm:flex-row sm:items-center sm:gap-3 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">
              <span className="align-middle">{content.title}</span>
              {content.badge && (
                <span className="ml-2 inline-flex items-center gap-1.5 align-middle rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                  {content.badge}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground leading-snug truncate">
              {content.description}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-brand shrink-0 group-hover:translate-x-0.5 transition-transform duration-200">
            Explore
            <ArrowRight className="size-3.5" />
          </span>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="relative ml-1 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Dismiss launch banner"
          data-testid={content.testId ? `${content.testId}-dismiss` : undefined}
        >
          <X className="size-4" />
        </button>
      </a>
    </section>
  );
}
