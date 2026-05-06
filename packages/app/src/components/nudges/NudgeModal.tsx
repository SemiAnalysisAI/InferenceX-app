'use client';

import { X } from 'lucide-react';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

import type { NudgeContent, NudgeContext } from '@/lib/nudges';

interface NudgeModalProps {
  id: string;
  content: NudgeContent;
  ctx: NudgeContext;
  onAction: () => void;
}

/**
 * Bottom-right modal-card. Renders the nudge as a non-blocking dialog with a
 * dismiss (X) and a primary CTA. Mirrors the look of the original
 * `Dsv4LaunchModal` / `GitHubStarModal` so the visual change is invisible.
 */
export function NudgeModal({ id, content, ctx, onAction }: NudgeModalProps) {
  const router = useRouter();
  const titleId = `nudge-${id}-title`;
  const descriptionId = `nudge-${id}-description`;

  const handleAction = useCallback(() => {
    const action = content.primaryAction;
    if (!action) return;
    onAction();
    if (action.onClick) action.onClick(ctx);
    if (action.href) {
      if (action.target === '_blank') {
        window.open(action.href, '_blank', 'noopener,noreferrer');
      } else if (action.inApp) {
        router.push(action.href);
      } else {
        window.location.href = action.href;
      }
    }
  }, [content.primaryAction, ctx, onAction, router]);

  return (
    <aside
      data-testid={`nudge-${id}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md rounded-lg border bg-background p-6 shadow-lg"
    >
      <button
        type="button"
        onClick={ctx.dismiss}
        className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-label="Close"
        data-testid={`nudge-${id}-dismiss`}
      >
        <X className="size-4" />
      </button>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5 pr-6">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
            {content.icon}
            {content.title}
            {content.badge && (
              <span className="ml-1 inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                {content.badge}
              </span>
            )}
          </h2>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {content.description}
          </p>
        </div>
        {content.primaryAction && (
          <div className="flex flex-row justify-end gap-2">
            <Button variant="outline" onClick={ctx.dismiss} data-testid={`nudge-${id}-secondary`}>
              Maybe Later
            </Button>
            <Button onClick={handleAction} data-testid={`nudge-${id}-primary`}>
              {content.primaryAction.icon}
              {content.primaryAction.label}
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
