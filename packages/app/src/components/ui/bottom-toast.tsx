'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

const DISMISS_EVENT = 'inferencex:dismiss-toast';

/** Horizontal swipe distance (px) that dismisses the toast on touch screens. */
const SWIPE_DISMISS_PX = 80;

interface BottomToastProps {
  /** Icon to display on the left */
  icon: React.ReactNode;
  /** Title text */
  title: string;
  /** Description text */
  description: string;
  /** Optional action button */
  action?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
  };
  /** Called only when dismissed via X button or external event (not after action click) */
  onDismiss?: () => void;
  /** data-testid for the toast container */
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

  const dismiss = useCallback(() => {
    setAnimate(false);
    track('toast_dismissed', { title });
    setTimeout(() => {
      setVisible(false);
      if (!actionClickedRef.current) onDismissRef.current?.();
    }, 300);
  }, [title]);

  // On mount: dismiss any existing toast, then animate in
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
  const dragLift = drag ? Math.max(0, drag.dy) : 0;

  return (
    <div
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
        // Measure from the gesture's own end point: the `drag` state can lag
        // the last touchmove, and a quick flick may never set it at all.
        const start = touchStartRef.current;
        const touch = event.changedTouches[0];
        touchStartRef.current = null;
        setDrag(null);
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) > SWIPE_DISMISS_PX || dy > SWIPE_DISMISS_PX / 2) {
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
              transform: `translate(${dragOffset}px, ${dragLift}px)`,
              opacity: Math.max(0.2, 1 - Math.abs(dragOffset) / 240),
              transition: 'none',
            }
          : undefined
      }
      className={`fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 touch-pan-y transition-all duration-300 ease-out sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-sm ${
        animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="relative flex items-start gap-3 rounded-xl border border-border bg-card p-3 shadow-lg sm:rounded-lg sm:p-4">
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-1 right-1 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors sm:top-2 sm:right-2 sm:size-auto"
          aria-label={locale === 'zh' ? '关闭' : 'Dismiss'}
        >
          <X className="size-4 sm:size-3.5" />
        </button>

        <div className="shrink-0 mt-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-7 sm:gap-2 sm:pr-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground sm:line-clamp-none">
            {description}
          </p>
          {action && (
            <button
              type="button"
              onClick={handleAction}
              className="flex min-h-9 items-center gap-1.5 self-end px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors sm:min-h-0"
            >
              {action.icon}
              {action.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
