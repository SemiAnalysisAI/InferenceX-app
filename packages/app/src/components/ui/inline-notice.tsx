'use client';

import { X } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/button';

const STRINGS = {
  en: { dismiss: 'Dismiss' },
  zh: { dismiss: '关闭' },
} as const;

const TONES = {
  brand: { box: 'border-brand/30 bg-brand/5', icon: 'text-brand' },
  warning: { box: 'border-warning/30 bg-warning/5', icon: 'text-warning' },
} as const;

interface InlineNoticeProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: ReactNode;
  action?: { label: string; icon?: ReactNode; onClick: () => void };
  onDismiss: () => void;
  testId?: string;
  tone?: keyof typeof TONES;
  className?: string;
}

export function InlineNotice({
  icon: Icon,
  title,
  description,
  action,
  onDismiss,
  testId,
  tone = 'brand',
  className,
}: InlineNoticeProps) {
  const locale = useLocale();
  return (
    <div
      data-testid={testId}
      role="status"
      aria-live="polite"
      className={cn(
        'no-export flex items-start gap-2 rounded-lg border py-2 pr-1 pl-3 [contain:inline-size]',
        TONES[tone].box,
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', TONES[tone].icon)} />
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
              track('toast_action_clicked', { title, action_label: action.label });
              action.onClick();
            }}
          >
            {action.icon}
            {action.label}
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
