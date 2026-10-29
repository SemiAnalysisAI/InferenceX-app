'use client';

import { ArrowRight, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { localePath, type Locale } from '@/lib/i18n/i18n';
import {
  isDismissed,
  isPermanentlySuppressed,
  isWithinSchedule,
  markDismissed,
  markShown,
} from '@/lib/nudges/persistence';
import { dismissesOnAction } from '@/lib/nudges/policy';
import { NUDGE_REGISTRY } from '@/lib/nudges/registry';
import type { NudgeAction, NudgeDefinition, NudgeScope, NudgeTrigger } from '@/lib/nudges/types';
import {
  assignedLandingBannerVariant,
  LANDING_BANNER_DISMISSED_ATTRIBUTE,
} from '@/lib/nudges/landing-banner';
import { BottomToast } from '@/components/ui/bottom-toast';
import { useIsMobileViewport } from '@/hooks/useMediaQuery';
import { CoachMark } from '@/components/ui/coach-mark';
import { Button } from '@/components/ui/button';
import { NewBadge } from '@/components/ui/new-badge';

function trackNudgeEvent(def: NudgeDefinition, event: 'shown' | 'dismissed' | 'action'): void {
  const name = def.analytics?.[event] ?? `${def.id}_${event}`;
  track(name, def.analytics?.properties);
}

function isEligible(
  def: NudgeDefinition,
  { requireAnchor = true, requireConditions = true } = {},
): boolean {
  if (requireAnchor && def.type === 'coach-mark' && !def.content.anchor?.resolve()) return false;
  if (!isWithinSchedule(def.schedule)) return false;
  if (def.variant && def.variant !== assignedLandingBannerVariant()) return false;
  if (def.permanentSuppressKey && isPermanentlySuppressed(def.permanentSuppressKey)) return false;
  if (isDismissed(def.storageKey, def.dismissal)) return false;
  if (requireConditions && def.conditions?.some((condition) => !condition.check())) return false;
  return true;
}

interface NudgeEngineProps {
  scope: NudgeScope;
}

export function NudgeEngine({ scope }: NudgeEngineProps) {
  const scopeNudges = useMemo(() => NUDGE_REGISTRY.filter((n) => n.scope === scope), [scope]);

  const initialBanners = useMemo(
    () =>
      scopeNudges
        .filter((nudge) => {
          if (nudge.type !== 'banner' || !nudge.renderOnInitialLoad) return false;
          if (!isWithinSchedule(nudge.schedule)) return false;
          const triggers = Array.isArray(nudge.trigger) ? nudge.trigger : [nudge.trigger];
          return triggers.some((trigger) => trigger.type === 'immediate');
        })
        .toSorted((a, b) => b.priority - a.priority),
    [scopeNudges],
  );
  const [activeBannerId, setActiveBannerId] = useState<string | null>(
    () => initialBanners[0]?.id ?? null,
  );
  // The server cannot know the visitor's A/B arm, so every arm is rendered until the
  // client reads the arm the pre-paint script assigned. CSS hides the other arms meanwhile.
  const [bannerVariantResolved, setBannerVariantResolved] = useState(
    () => !initialBanners.some((nudge) => nudge.variant),
  );
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [activeCoachMarkId, setActiveCoachMarkId] = useState<string | null>(null);
  const bannerShownRef = useRef(false);
  const overlayShownRef = useRef(false);
  const coachMarkShownRef = useRef(false);

  const triggerCountsRef = useRef<Record<string, number>>({});
  const eventDetailRef = useRef<Record<string, unknown> | null>(null);
  const sessionDismissedRef = useRef<Set<string>>(new Set());

  const isMobileViewport = useIsMobileViewport();

  const activeBanner = activeBannerId ? scopeNudges.find((n) => n.id === activeBannerId) : null;
  const activeOverlay = activeOverlayId ? scopeNudges.find((n) => n.id === activeOverlayId) : null;
  const activeCoachMark = activeCoachMarkId
    ? scopeNudges.find((n) => n.id === activeCoachMarkId)
    : null;

  const showNudge = useCallback((def: NudgeDefinition) => {
    if (sessionDismissedRef.current.has(def.id)) return;
    if (!isEligible(def)) return;

    if (def.type === 'banner') {
      if (bannerShownRef.current) return;
      bannerShownRef.current = true;
      setActiveBannerId(def.id);
    } else if (def.type === 'coach-mark') {
      if (coachMarkShownRef.current) return;
      coachMarkShownRef.current = true;
      setActiveCoachMarkId(def.id);
    } else {
      if (overlayShownRef.current) return;
      overlayShownRef.current = true;
      setActiveOverlayId(def.id);
    }
    markShown(def.storageKey, def.dismissal);
    trackNudgeEvent(def, 'shown');
  }, []);

  const dismissBanner = useCallback(() => {
    if (!activeBanner) return;
    trackNudgeEvent(activeBanner, 'dismissed');
    markDismissed(activeBanner.storageKey, activeBanner.dismissal);
    if (activeBanner.renderOnInitialLoad) {
      document.documentElement.setAttribute(LANDING_BANNER_DISMISSED_ATTRIBUTE, '');
    }
    sessionDismissedRef.current.add(activeBanner.id);
    setActiveBannerId(null);
    bannerShownRef.current = false;
  }, [activeBanner]);

  const dismissOverlay = useCallback(() => {
    if (!activeOverlay) return;
    trackNudgeEvent(activeOverlay, 'dismissed');
    markDismissed(activeOverlay.storageKey, activeOverlay.dismissal);
    sessionDismissedRef.current.add(activeOverlay.id);
    setActiveOverlayId(null);
    overlayShownRef.current = false;
  }, [activeOverlay]);

  const dismissCoachMark = useCallback(() => {
    if (!activeCoachMark) return;
    trackNudgeEvent(activeCoachMark, 'dismissed');
    markDismissed(activeCoachMark.storageKey, activeCoachMark.dismissal);
    sessionDismissedRef.current.add(activeCoachMark.id);
    setActiveCoachMarkId(null);
    coachMarkShownRef.current = false;
  }, [activeCoachMark]);

  const handleCoachMarkAction = useCallback(() => {
    if (!activeCoachMark) return;
    trackNudgeEvent(activeCoachMark, 'action');
    activeCoachMark.content.action?.onClick(eventDetailRef.current ?? undefined);
    if (!dismissesOnAction(activeCoachMark)) return;
    markDismissed(activeCoachMark.storageKey, activeCoachMark.dismissal);
    sessionDismissedRef.current.add(activeCoachMark.id);
    setActiveCoachMarkId(null);
    coachMarkShownRef.current = false;
  }, [activeCoachMark]);

  const handleBannerAction = useCallback(() => {
    if (!activeBanner) return;
    trackNudgeEvent(activeBanner, 'action');
    activeBanner.content.onLinkClick?.();
    if (!dismissesOnAction(activeBanner)) return;
    markDismissed(activeBanner.storageKey, activeBanner.dismissal);
    if (activeBanner.renderOnInitialLoad) {
      document.documentElement.setAttribute(LANDING_BANNER_DISMISSED_ATTRIBUTE, '');
    }
    sessionDismissedRef.current.add(activeBanner.id);
    setActiveBannerId(null);
    bannerShownRef.current = false;
  }, [activeBanner]);

  const handleOverlayAction = useCallback(
    (action?: NudgeAction) => {
      if (!activeOverlay) return;
      trackNudgeEvent(activeOverlay, 'action');
      const detail = eventDetailRef.current ?? undefined;

      if (activeOverlay.type === 'toast') {
        activeOverlay.content.action?.onClick(detail);
      } else if (activeOverlay.type === 'modal') {
        (action ?? activeOverlay.content.primaryAction)?.onClick(detail);
      }

      if (!dismissesOnAction(activeOverlay)) return;
      markDismissed(activeOverlay.storageKey, activeOverlay.dismissal);
      sessionDismissedRef.current.add(activeOverlay.id);
      setActiveOverlayId(null);
      overlayShownRef.current = false;
    },
    [activeOverlay],
  );

  useEffect(() => {
    if (bannerVariantResolved) return;
    const variant = assignedLandingBannerVariant();
    const assigned = initialBanners.find((nudge) => nudge.variant === variant);
    if (assigned && activeBanner?.variant) {
      setActiveBannerId(assigned.id);
      if (isEligible(assigned)) trackNudgeEvent(assigned, 'shown');
    }
    setBannerVariantResolved(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bannerVariantResolved) return;
    if (activeBanner && !isEligible(activeBanner)) {
      setActiveBannerId(null);
      bannerShownRef.current = false;
      return;
    }

    const cleanups: (() => void)[] = [];
    const sorted = [...scopeNudges].toSorted((a, b) => b.priority - a.priority);

    for (const def of sorted) {
      if (def.id === activeBannerId || def.id === activeOverlayId) continue;
      if (def.id === activeCoachMarkId) continue;
      if (!isEligible(def, { requireAnchor: false, requireConditions: false })) continue;
      if (sessionDismissedRef.current.has(def.id)) continue;

      const triggers = Array.isArray(def.trigger) ? def.trigger : [def.trigger];
      const triggerEvents = new Set(
        triggers.flatMap((trigger) => (trigger.type === 'event' ? [trigger.event] : [])),
      );

      for (const trigger of triggers) {
        const cleanup = setupTrigger(trigger, def, showNudge, triggerCountsRef, eventDetailRef);
        if (cleanup) cleanups.push(cleanup);
      }

      for (const condition of def.conditions ?? []) {
        const event = condition.listenEvent;
        if (!event || triggerEvents.has(event)) continue;
        const handler = () => showNudge(def);
        window.addEventListener(event, handler);
        cleanups.push(() => window.removeEventListener(event, handler));
      }
    }

    return () => {
      for (const fn of cleanups) fn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBannerId, activeOverlayId, activeCoachMarkId, scope, bannerVariantResolved]);

  useEffect(() => {
    const handlers: [string, () => void][] = [];

    for (const def of scopeNudges) {
      if (!def.permanentSuppressEvent) continue;

      const handler = () => {
        if (def.type === 'banner' && activeBannerId === def.id) {
          setActiveBannerId(null);
          bannerShownRef.current = false;
        } else if (def.type === 'coach-mark' && activeCoachMarkId === def.id) {
          setActiveCoachMarkId(null);
          coachMarkShownRef.current = false;
        } else if (activeOverlayId === def.id) {
          setActiveOverlayId(null);
          overlayShownRef.current = false;
        }
        sessionDismissedRef.current.add(def.id);
        if (def.permanentSuppressKey) {
          try {
            localStorage.setItem(def.permanentSuppressKey, '1');
          } catch {}
        }
        markDismissed(def.storageKey, def.dismissal);
      };
      window.addEventListener(def.permanentSuppressEvent, handler);
      handlers.push([def.permanentSuppressEvent, handler]);
    }

    return () => {
      for (const [event, handler] of handlers) {
        window.removeEventListener(event, handler);
      }
    };
  }, [activeBannerId, activeOverlayId, activeCoachMarkId, scopeNudges]);

  const deferToastForCoachMark = isMobileViewport && Boolean(activeCoachMark?.content.anchor);

  return (
    <>
      {(!bannerVariantResolved && activeBanner?.variant
        ? initialBanners.filter((nudge) => nudge.variant)
        : activeBanner
          ? [activeBanner]
          : []
      ).map((banner) => (
        <BannerRenderer
          key={banner.id}
          def={banner}
          onDismiss={dismissBanner}
          onAction={handleBannerAction}
        />
      ))}
      {activeOverlay?.type === 'toast' && !deferToastForCoachMark && (
        <ToastRenderer
          def={activeOverlay}
          onDismiss={dismissOverlay}
          onAction={() => handleOverlayAction()}
        />
      )}
      {activeOverlay?.type === 'modal' && (
        <ModalRenderer
          def={activeOverlay}
          onDismiss={dismissOverlay}
          onAction={handleOverlayAction}
        />
      )}
      {activeCoachMark?.content.anchor && (
        <CoachMarkRenderer
          def={activeCoachMark}
          onDismiss={dismissCoachMark}
          onAction={handleCoachMarkAction}
        />
      )}
    </>
  );
}

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

  if (trigger.type === 'idle') {
    let idleId: number | undefined;
    let timer: number | undefined;
    const show = () => showNudge(def);
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(show, { timeout: 2000 });
      } else timer = window.setTimeout(show, 0);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      window.removeEventListener('load', schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timer !== undefined) window.clearTimeout(timer);
    };
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

function localized(locale: Locale, en: string, zh?: string): string {
  return locale === 'zh' && zh ? zh : en;
}

const RENDERER_STRINGS = {
  en: {
    explore: 'Explore',
    maybeLater: 'Maybe Later',
    close: 'Close',
    dismissBanner: 'Dismiss launch banner',
  },
  zh: { explore: '探索', maybeLater: '稍后再看', close: '关闭', dismissBanner: '关闭发布横幅' },
} as const;

function ToastRenderer({
  def,
  onDismiss,
  onAction,
}: {
  def: NudgeDefinition;
  onDismiss: () => void;
  onAction: () => void;
}) {
  const locale = useLocale();
  const { content } = def;
  const Icon = content.icon;
  return (
    <BottomToast
      testId={content.testId}
      icon={<Icon className={content.iconClassName} />}
      title={localized(locale, content.title, content.titleZh)}
      description={localized(locale, content.description, content.descriptionZh)}
      action={
        content.action
          ? {
              label: localized(locale, content.action.label, content.action.labelZh),
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
  onAction: (action?: NudgeAction) => void;
}) {
  const locale = useLocale();
  const rs = RENDERER_STRINGS[locale];
  const { content } = def;
  const Icon = content.icon;
  const idPrefix = def.id;
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;
  const centered = content.centered;
  const dialogRef = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!centered) return;
    const dialogEl = dialogRef.current;
    if (!dialogEl) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      [
        ...dialogEl.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
    const primary = dialogEl.querySelector<HTMLElement>('[data-modal-primary]');
    (primary ?? focusable()[0] ?? dialogEl).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialogEl.focus();
        return;
      }
      const first = items[0];
      const last = items.at(-1)!;
      const active = document.activeElement;
      const outside = active === dialogEl || !dialogEl.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [centered]);

  const dialog = (
    <div
      ref={dialogRef}
      tabIndex={centered ? -1 : undefined}
      data-testid={content.testId}
      role="dialog"
      aria-modal={centered ? 'true' : 'false'}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={
        centered
          ? `relative z-50 w-[calc(100vw-2rem)] max-w-md rounded-xl border bg-background p-6 shadow-lg sm:p-8 ${content.containerClassName ?? ''}`
          : `fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md rounded-lg border bg-background p-6 shadow-lg ${content.containerClassName ?? ''}`
      }
    >
      <button
        type="button"
        onClick={onDismiss}
        className={`absolute rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none ${centered ? 'right-2 top-2 flex size-9 items-center justify-center focus-visible:ring-2 focus-visible:ring-ring' : 'right-4 top-4'}`}
        aria-label={rs.close}
      >
        <X className={centered ? 'size-5' : 'size-4'} />
      </button>
      {content.renderContent ? (
        content.renderContent({ dismiss: onDismiss, titleId, descriptionId })
      ) : (
        <div className={`flex flex-col ${centered ? 'gap-7' : 'gap-4'}`}>
          <div className={centered ? 'text-center' : 'space-y-1.5 pr-6'}>
            {centered && (
              <div className="mb-5 flex min-h-5 items-center justify-center gap-2">
                <Icon className={`size-6 shrink-0 ${content.iconClassName ?? ''}`} />
                {content.badge && (
                  <NewBadge data-new-badge="launch-modal" flashing>
                    {localized(locale, content.badge, content.badgeZh)}
                  </NewBadge>
                )}
              </div>
            )}
            <h2
              id={titleId}
              className={
                centered
                  ? 'text-balance text-dialog-title font-semibold'
                  : 'flex items-center gap-2 text-lg font-semibold'
              }
            >
              {!centered && <Icon className={`size-5 shrink-0 ${content.iconClassName ?? ''}`} />}
              {localized(locale, content.title, content.titleZh)}
              {!centered && content.badge && (
                <NewBadge data-new-badge="launch-modal" className="ml-1" flashing>
                  {localized(locale, content.badge, content.badgeZh)}
                </NewBadge>
              )}
            </h2>
            <p
              id={descriptionId}
              className={`text-sm text-muted-foreground ${centered ? 'mt-3' : ''}`}
            >
              {localized(locale, content.description, content.descriptionZh)}
            </p>
          </div>
          <div
            className={
              centered &&
              content.hideDismissButton &&
              content.primaryAction &&
              content.secondaryAction
                ? 'grid grid-cols-2 gap-3'
                : `flex flex-row flex-wrap gap-2 ${centered ? 'justify-center' : 'justify-end'}`
            }
          >
            {!content.hideDismissButton && (
              <Button
                variant="outline"
                onClick={onDismiss}
                data-testid={content.testId ? `${content.testId}-dismiss` : undefined}
              >
                {localized(
                  locale,
                  content.dismissLabel ?? 'Maybe Later',
                  content.dismissLabelZh ?? rs.maybeLater,
                )}
              </Button>
            )}
            {content.primaryAction && (
              <Button
                onClick={() => onAction(content.primaryAction)}
                data-modal-primary=""
                data-testid={content.testId ? `${content.testId}-action` : undefined}
                className={`${centered ? 'min-h-11 [&_img]:size-5' : ''} ${content.actionClassName ?? ''}`}
              >
                {content.primaryAction.icon}
                {localized(locale, content.primaryAction.label, content.primaryAction.labelZh)}
              </Button>
            )}
            {content.secondaryAction && (
              <Button
                onClick={() => onAction(content.secondaryAction)}
                data-testid={content.testId ? `${content.testId}-secondary-action` : undefined}
                className={`${centered ? 'min-h-11 [&_img]:size-5' : ''} ${content.actionClassName ?? ''}`}
              >
                {content.secondaryAction.icon}
                {localized(locale, content.secondaryAction.label, content.secondaryAction.labelZh)}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (centered) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button
          type="button"
          aria-label={rs.close}
          tabIndex={-1}
          onClick={onDismiss}
          className="absolute inset-0 cursor-default bg-black/50"
        />
        {dialog}
      </div>
    );
  }

  return dialog;
}

function CoachMarkRenderer({
  def,
  onDismiss,
  onAction,
}: {
  def: NudgeDefinition;
  onDismiss: () => void;
  onAction: () => void;
}) {
  const locale = useLocale();
  const { content } = def;
  const Icon = content.icon;
  const anchor = content.anchor!;

  return (
    <CoachMark
      anchor={anchor}
      icon={<Icon className={content.iconClassName} />}
      title={localized(locale, content.title, content.titleZh)}
      description={localized(locale, content.description, content.descriptionZh)}
      onDismiss={onDismiss}
      onAction={onAction}
      testId={content.testId}
    />
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
  const locale = useLocale();
  const rs = RENDERER_STRINGS[locale];
  const { content } = def;
  const Icon = content.icon;
  const href = content.href?.startsWith('/')
    ? localePath(content.href, locale)
    : (content.href ?? '#');

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
    <section
      className="container mx-auto px-4 lg:px-8 mb-6 lg:mb-4"
      data-initial-banner={def.renderOnInitialLoad ? '' : undefined}
      data-banner-variant={def.variant}
    >
      <a
        href={href}
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
            <p className="text-sm font-semibold leading-snug break-words">
              <span className="align-middle">
                {localized(locale, content.title, content.titleZh)}
              </span>
              {content.badge && (
                <NewBadge data-new-badge="launch-banner" className="ml-2 align-middle" flashing>
                  {localized(locale, content.badge, content.badgeZh)}
                </NewBadge>
              )}
            </p>
            <p className="text-xs text-muted-foreground leading-snug break-words">
              {localized(locale, content.description, content.descriptionZh)}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-brand shrink-0 group-hover:translate-x-0.5 transition-transform duration-200">
            {localized(locale, content.linkLabel ?? rs.explore, content.linkLabelZh)}
            <ArrowRight className="size-3.5" />
          </span>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="relative ml-1 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          aria-label={rs.dismissBanner}
          data-testid={content.testId ? `${content.testId}-dismiss` : undefined}
        >
          <X className="size-4" />
        </button>
      </a>
    </section>
  );
}
