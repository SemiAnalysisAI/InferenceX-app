'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n';

const STRINGS = {
  en: {
    title: '404 - Page Not Found',
    description: 'The page you are looking for does not exist.',
    home: 'Go back home',
  },
  zh: {
    title: '404 - 页面不存在',
    description: '找不到该页面。',
    home: '返回首页',
  },
} as const;

export function NotFoundContent({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  const href = locale === 'zh' ? '/zh' : '/';

  return (
    <div className="flex grow flex-col items-center justify-center px-4 text-center text-foreground">
      <h1 className="mb-4 text-4xl font-bold">{t.title}</h1>
      <p className="mb-8 text-lg">{t.description}</p>
      <Link
        href={href}
        data-testid="not-found-home"
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
        onClick={() => track('not_found_home_clicked', { locale })}
      >
        {t.home}
      </Link>
    </div>
  );
}
