'use client';

import { ArrowUpRight, Info } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { useUnofficialDomain } from '@/hooks/useUnofficialDomain';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { useLocale } from '@/lib/i18n/use-locale';
import { OFFICIAL_HOSTNAME } from '@/lib/runtime/unofficial-domain';

const STRINGS = {
  en: {
    title: 'Unofficial deployment',
    text: 'This copy of InferenceX™ is not affiliated with or endorsed by SemiAnalysis. Its data may be modified or out of date.',
    link: 'Official results',
  },
  zh: {
    title: '非官方部署',
    text: '此 InferenceX™ 副本与 SemiAnalysis 无关联，也未获其背书，其数据可能已被修改或已过期。',
    link: '官方结果',
  },
} as const;

export function UnofficialDomainNotice() {
  const isUnofficial = useUnofficialDomain();
  const t = STRINGS[useLocale()];
  const pathname = usePathname();

  if (!isUnofficial || isEmbedPathname(pathname)) return null;

  return (
    <div className="container mx-auto px-4 lg:px-8 mb-4">
      <div
        role="note"
        data-testid="unofficial-domain-notice"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/50 bg-card px-4 py-3"
      >
        <Info aria-hidden className="size-4 shrink-0 text-brand" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t.title}</span>
          <span aria-hidden> · </span>
          {t.text}
        </p>
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={OFFICIAL_HOSTNAME}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand underline-offset-2 hover:underline"
        >
          {t.link}
          <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
