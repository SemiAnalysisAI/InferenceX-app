'use client';

import { ArrowRight, GraduationCap } from 'lucide-react';

import { NewBadge } from '@/components/ui/new-badge';
import type { Locale } from '@/lib/i18n/i18n';
import { powerxTutorialPath } from '@/lib/powerx/tutorial-path';
import { cn } from '@/lib/shared/utils';

import { PowerXTutorialLink } from './powerx-tutorial-link';

const STRINGS: Record<Locale, { badge: string; eyebrow: string; title: string }> = {
  en: { badge: 'NEW', eyebrow: 'Interactive tutorial', title: 'How we measure power' },
  zh: { badge: '新', eyebrow: '交互式教程', title: 'PowerX 如何测量功耗' },
};

/** Header call-to-action that points first-time PowerX readers at the tutorial. */
export function PowerXTutorialCta({ locale, className }: { locale: Locale; className?: string }) {
  const t = STRINGS[locale];

  return (
    <PowerXTutorialLink
      href={powerxTutorialPath(locale)}
      analyticsEvent="powerx_tutorial_section_opened"
      analyticsTarget="powerx-header"
      data-testid="powerx-tutorial-link"
      aria-label={`${t.eyebrow}: ${t.title}`}
      className={cn(
        'group flex min-h-11 items-center gap-3 rounded-lg border border-brand/50 bg-brand/10 py-1.5 pr-3 pl-2 text-left transition-colors hover:border-brand hover:bg-brand/15 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-primary-foreground"
      >
        <GraduationCap className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 text-xs font-medium text-brand">
          {t.eyebrow}
          <NewBadge aria-hidden>{t.badge}</NewBadge>
        </span>
        <span className="text-sm font-semibold text-foreground">{t.title}</span>
      </span>
      <ArrowRight
        aria-hidden
        className="ml-auto hidden size-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5 sm:block"
      />
    </PowerXTutorialLink>
  );
}
