'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';

const DISMISS_EVENT = 'inferencex:dismiss-toast';

const SWIPE_DISMISS_PX = 80;

const PHONE_QUERY = '(max-width: 639px)';

/**
 * Heights reserved by every docked toast currently mounted. A replacement toast mounts
 * while the outgoing one is still animating out, so reservations are shared: body padding
 * is the largest active reservation, and the original padding is restored only when the
 * last one is released.
 */
const reservations = new Map<symbol, number>();
let paddingBeforeReservations: string | null = null;

function syncBodyPadding() {
  const { body } = document;
  if (reservations.size === 0) {
    if (paddingBeforeReservations !== null) body.style.paddingBottom = paddingBeforeReservations;
    paddingBeforeReservations = null;
    return;
  }
  if (paddingBeforeReservations === null) paddingBeforeReservations = body.style.paddingBottom;
  const height = Math.max(...reservations.values());
  body.style.paddingBottom = height > 0 ? `${height}px` : paddingBeforeReservations;
}

/**
 * On phones the toast is docked to the bottom edge, so reserve its height as body padding
 * while it is visible: the end of the page can always scroll clear of it.
 */
function useReserveBottomSpace(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function' || typeof ResizeObserver === 'undefined') return;
    const media = window.matchMedia(PHONE_QUERY);
    const key = Symbol('bottom-toast');
    const apply = () => {
      reservations.set(key, media.matches ? el.getBoundingClientRect().height : 0);
      syncBodyPadding();
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    media.addEventListener('change', apply);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', apply);
      reservations.delete(key);
      syncBodyPadding();
    };
  }, [ref, active]);
}

interface BottomToastProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
  };
  onDismiss?: () => void;
  testId?: string;
}

export function BottomToast({
  icon,
  title,
  description,
  action,
  onDismiss,
  testId,
}: BottomToastProps) {
  const locale = useLocale();
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);
  const actionClickedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const toastRef = useRef<HTMLDivElement>(null);
  useReserveBottomSpace(toastRef, visible);

  const dismiss = useCallback(() => {
    setAnimate(false);
    track('toast_dismissed', { title });
    setTimeout(() => {
      setVisible(false);
      if (!actionClickedRef.current) onDismissRef.current?.();
    }, 300);
  }, [title]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(DISMISS_EVENT));
    requestAnimationFrame(() => setAnimate(true));

    const handleDismiss = () => dismiss();
    window.addEventListener(DISMISS_EVENT, handleDismiss);
    return () => window.removeEventListener(DISMISS_EVENT, handleDismiss);
  }, [dismiss]);

  const handleAction = useCallback(() => {
    actionClickedRef.current = true;
    track('toast_action_clicked', { title, actionLabel: action?.label });
    action?.onClick();
    dismiss();
  }, [action, dismiss, title]);

  if (!visible) return null;

  const dragOffset = drag ? drag.dx : 0;

  return (
    <div
      ref={toastRef}
      data-testid={testId}
      role="status"
      aria-live="polite"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (!touch || event.touches.length !== 1) return;
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchMove={(event) => {
        const start = touchStartRef.current;
        const touch = event.touches[0];
        if (!start || !touch) return;
        setDrag({ dx: touch.clientX - start.x, dy: touch.clientY - start.y });
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        const touch = event.changedTouches[0];
        touchStartRef.current = null;
        setDrag(null);
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) > SWIPE_DISMISS_PX && Math.abs(dx) > Math.abs(dy)) {
          dismiss();
        }
      }}
      onTouchCancel={() => {
        touchStartRef.current = null;
        setDrag(null);
      }}
      style={
        drag
          ? {
              transform: `translateX(${dragOffset}px)`,
              opacity: Math.max(0.2, 1 - Math.abs(dragOffset) / 240),
              transition: 'none',
            }
          : undefined
      }
      className={`fixed inset-x-0 bottom-0 z-50 touch-pan-y transition-all duration-300 ease-out sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-sm ${
        animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-t-xl border-t border-border bg-card px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.35)] sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-x-3 sm:rounded-lg sm:border sm:p-4 sm:shadow-lg">
        <div className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5 sm:mt-0.5">{icon}</div>

        <div className="flex min-w-0 flex-col gap-0.5 sm:gap-2 sm:pr-4">
          <p className="truncate text-sm font-medium text-foreground sm:whitespace-normal">
            {title}
          </p>
          <p className="line-clamp-1 text-xs text-muted-foreground sm:line-clamp-none">
            {description}
          </p>
        </div>

        {action && (
          <button
            type="button"
            onClick={handleAction}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 sm:col-start-2 sm:mt-2 sm:min-h-0 sm:justify-self-end"
          >
            {action.icon}
            {action.label}
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground sm:absolute sm:top-2 sm:right-2 sm:size-auto ${
            action ? '' : 'col-start-4 sm:col-start-auto'
          }`}
          aria-label={locale === 'zh' ? '关闭' : 'Dismiss'}
        >
          <X className="size-4 sm:size-3.5" />
        </button>
      </div>
    </div>
  );
}
