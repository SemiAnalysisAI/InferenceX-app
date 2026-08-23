'use client'; // Error components must be Client Components
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { track } from '@/lib/analytics';
import { isZhPathname } from '@/lib/i18n';

const STRINGS = {
  en: {
    title: 'Something went wrong!',
    description: 'An unexpected error has occurred.',
    retry: 'Try again',
  },
  zh: {
    title: '页面出了点问题',
    description: '发生意外错误。请重试。',
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
      className="flex grow flex-col items-center justify-center px-4 text-center text-foreground"
    >
      <h2 className="text-4xl font-bold mb-4">{t.title}</h2>
      <p className="text-lg mb-4">{t.description}</p>
      <p className="text-md mb-8 max-w-full break-words text-red-500">{error.message}</p>
      <button
        type="button"
        className="min-h-11 rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        onClick={() => {
          track('error_page_retry', { locale });
          reset();
        }}
      >
        {t.retry}
      </button>
    </div>
  );
}
