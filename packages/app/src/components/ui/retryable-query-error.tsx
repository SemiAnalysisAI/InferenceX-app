'use client';

import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';

import { Button } from './button';

interface RetryableQueryErrorProps {
  message: string;
  analyticsEvent: string;
  onRetry: () => void | Promise<unknown>;
  testId: string;
}

/** A query failure state that stays distinct from a valid empty response. */
export function RetryableQueryError({
  message,
  analyticsEvent,
  onRetry,
  testId,
}: RetryableQueryErrorProps) {
  const locale = useLocale();
  return (
    <div
      data-testid={testId}
      className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <span>{message}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          track(analyticsEvent);
          void onRetry();
        }}
      >
        {locale === 'zh' ? '重试' : 'Retry'}
      </Button>
    </div>
  );
}
