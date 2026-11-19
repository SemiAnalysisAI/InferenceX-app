'use client';

import { useLocale } from '@/lib/i18n/use-locale';
import { type NudgeSlot, useInlineNudge } from '@/lib/nudges/inline-slot';
import { InlineNotice } from '@/components/ui/inline-notice';

export function InlineNudgeSlot({ slot, className }: { slot: NudgeSlot; className?: string }) {
  const locale = useLocale();
  const entry = useInlineNudge(slot);
  if (!entry) return null;

  const { def, onDismiss, onAction } = entry;
  const { content } = def;
  const action = content.action;

  return (
    <InlineNotice
      icon={content.icon}
      testId={content.testId}
      title={locale === 'zh' && content.titleZh ? content.titleZh : content.title}
      description={
        locale === 'zh' && content.descriptionZh ? content.descriptionZh : content.description
      }
      action={
        action && {
          label: locale === 'zh' && action.labelZh ? action.labelZh : action.label,
          icon: action.icon,
          onClick: onAction,
        }
      }
      onDismiss={onDismiss}
      className={className}
    />
  );
}
