'use client';

import { X } from 'lucide-react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { type NudgeSlot, useInlineNudge } from '@/lib/nudges/inline-slot';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/button';

const STRINGS = {
  en: { dismiss: 'Dismiss' },
  zh: { dismiss: '关闭' },
} as const;

export function InlineNudgeSlot({ slot, className }: { slot: NudgeSlot; className?: string }) {
  const locale = useLocale();
  const entry = useInlineNudge(slot);
  if (!entry) return null;

  const { def, onDismiss, onAction } = entry;
  const { content } = def;
  const Icon = content.icon;
  const title = locale === 'zh' && content.titleZh ? content.titleZh : content.title;
  const description =
    locale === 'zh' && content.descriptionZh ? content.descriptionZh : content.description;
  const action = content.action;
  const actionLabel = action && (locale === 'zh' && action.labelZh ? action.labelZh : action.label);

  return (
    <div
      data-testid={content.testId}
      role="status"
      aria-live="polite"
      className={cn(
        'no-export flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 py-2 pr-1 pl-3 [contain:inline-size]',
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
        {action && (
          <Button
            type="button"
            variant="outline"
            size="2xs"
            className="mt-2"
            onClick={() => {
              track('toast_action_clicked', { title, action_label: actionLabel });
              onAction();
            }}
          >
            {action.icon}
            {actionLabel}
          </Button>
        )}
      </div>
      <button
        type="button"
        aria-label={STRINGS[locale].dismiss}
        onClick={() => {
          track('toast_dismissed', { title });
          onDismiss();
        }}
        className="-my-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:size-7"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  );
}
