'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { BottomToast } from '@/components/ui/bottom-toast';

import type { NudgeContent, NudgeContext } from '@/lib/nudges';

interface NudgeToastProps {
  id: string;
  content: NudgeContent;
  ctx: NudgeContext;
  onAction: () => void;
}

export function NudgeToast({ id, content, ctx, onAction }: NudgeToastProps) {
  const router = useRouter();
  const { primaryAction } = content;

  const handleAction = useCallback(() => {
    if (!primaryAction) return;
    onAction();
    if (primaryAction.onClick) {
      primaryAction.onClick(ctx);
    }
    if (primaryAction.href) {
      if (primaryAction.target === '_blank') {
        window.open(primaryAction.href, '_blank', 'noopener,noreferrer');
      } else if (primaryAction.inApp) {
        router.push(primaryAction.href);
      } else {
        window.location.href = primaryAction.href;
      }
    }
  }, [primaryAction, ctx, onAction, router]);

  const action =
    primaryAction !== undefined
      ? {
          label: primaryAction.label,
          icon: primaryAction.icon,
          onClick: handleAction,
        }
      : undefined;

  return (
    <BottomToast
      testId={`nudge-${id}`}
      icon={content.icon}
      title={typeof content.title === 'string' ? content.title : String(content.title)}
      description={
        typeof content.description === 'string' ? content.description : String(content.description)
      }
      action={action}
      onDismiss={ctx.dismiss}
    />
  );
}
