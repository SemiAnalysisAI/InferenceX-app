'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const DISMISS_EVENT = 'inferencex:dismiss-toast';

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
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);
  const actionClickedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const dismiss = useCallback(() => {
    setAnimate(false);
    setTimeout(() => {
      setVisible(false);
      if (!actionClickedRef.current) onDismissRef.current?.();
    }, 300);
  }, []);

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
    action?.onClick();
    dismiss();
  }, [action, dismiss]);

  if (!visible) return null;

  return (
    <div
      data-testid={testId}
      className={`fixed bottom-6 right-6 z-50 max-w-sm transition-all duration-300 ease-out ${
        animate ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="relative flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg">
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="shrink-0 mt-0.5 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
          {action && (
            <button
              onClick={handleAction}
              className="flex items-center gap-1.5 self-end px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
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
