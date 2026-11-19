'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics/analytics';
import { isZhPathname } from '@/lib/i18n/i18n';

const STRINGS = {
  en: {
    title: 'Something went wrong',
    description: 'An unexpected error has occurred',
    retry: 'Try again',
  },
  zh: {
    title: '页面出了点问题',
    description: '发生意外错误',
    retry: '重试',
  },
} as const;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const locale = isZhPathname(pathname ?? '') ? 'zh' : 'en';
  const t = STRINGS[locale];

  useEffect(() => {
    console.error(error);
    track('error_page_shown', { message: error.message, digest: error.digest, locale });
  }, [error, locale]);

  return (
    <div
      role="alert"
      lang={locale === 'zh' ? 'zh-CN' : 'en'}
      className="flex grow flex-col items-center justify-center px-4 py-24 text-center text-foreground md:py-32"
    >
      <h2 className="mb-2 text-2xl font-semibold">{t.title}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t.description}</p>
      <p
        lang={locale === 'zh' ? 'en' : undefined}
        className="mb-8 max-w-full break-words font-mono text-xs text-muted-foreground"
      >
        {error.message}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          track('error_page_retry', { locale });
          reset();
        }}
      >
        {t.retry}
      </Button>
    </div>
  );
}
