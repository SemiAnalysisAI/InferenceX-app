'use client';

import { ArrowRight, X } from 'lucide-react';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import type { NudgeContent, NudgeContext } from '@/lib/nudges';

interface NudgeBannerProps {
  id: string;
  content: NudgeContent;
  ctx: NudgeContext;
  onAction: () => void;
}

/**
 * Inline announcement banner. The whole row is the primary action target; the X
 * button on the right dismisses without triggering the action. Mirrors the
 * original `LaunchBanner` styling.
 */
export function NudgeBanner({ id, content, ctx, onAction }: NudgeBannerProps) {
  const router = useRouter();
  const action = content.primaryAction;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (!action) return;
      e.preventDefault();
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
    },
    [action, ctx, onAction, router],
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      ctx.dismiss();
    },
    [ctx],
  );

  const href = action?.href ?? '#';

  return (
    <section className="relative">
      <a
        href={href}
        onClick={handleClick}
        className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-brand/40 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-4 py-3 transition-all duration-200 hover:border-brand/70 hover:shadow-lg hover:shadow-brand/10"
        data-testid={`nudge-${id}`}
      >
        <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-transparent via-brand/10 to-transparent" />
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          {content.icon}
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
          {action && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-brand shrink-0 group-hover:translate-x-0.5 transition-transform duration-200">
              {action.label}
              <ArrowRight className="size-3.5" />
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="relative ml-1 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Dismiss banner"
          data-testid={`nudge-${id}-dismiss`}
        >
          <X className="size-4" />
        </button>
      </a>
    </section>
  );
}
