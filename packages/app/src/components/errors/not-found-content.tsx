'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { track, trackOncePerPageview } from '@/lib/analytics/analytics';
import type { Locale } from '@/lib/i18n/i18n';

const STRINGS = {
  en: {
    title: 'Page not found',
    description: 'The page you are looking for does not exist',
    home: 'Go back home',
  },
  zh: {
    title: '页面不存在',
    description: '找不到该页面',
    home: '返回首页',
  },
} as const;

export function NotFoundContent({ locale }: { locale: Locale }) {
  const t = STRINGS[locale];
  const href = locale === 'zh' ? '/zh' : '/';

  useEffect(() => {
    trackOncePerPageview('not_found_page_shown', {
      locale,
      path: window.location.pathname,
      referrer_host: document.referrer ? new URL(document.referrer).host : null,
    });
  }, [locale]);

  return (
    <div className="flex grow flex-col items-center justify-center px-4 py-24 text-center text-foreground md:py-32">
      <Eyebrow as="p" className="mb-2 tabular-nums">
        404
      </Eyebrow>
      <h1 className="mb-2 text-2xl font-semibold">{t.title}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{t.description}</p>
      <Button asChild variant="outline">
        <Link href={href} onClick={() => track('not_found_home_clicked', { locale })}>
          {t.home}
        </Link>
      </Button>
    </div>
  );
}
