'use client';

import { ArrowRight, GraduationCap } from 'lucide-react';

import { TutorialLink } from '@/components/tutorial/tutorial-link';
import { NewBadge } from '@/components/ui/new-badge';
import type { Locale } from '@/lib/i18n/i18n';
import { powerxTutorialPath } from '@/lib/powerx/tutorial-path';
import { cn } from '@/lib/shared/utils';

const STRINGS: Record<Locale, { badge: string; eyebrow: string; title: string }> = {
  en: { badge: 'New', eyebrow: 'Interactive tutorial', title: 'How we measure power' },
  zh: { badge: '新', eyebrow: '交互式教程', title: 'PowerX 如何测量功耗' },
};

/** Header call-to-action that points first-time PowerX readers at the tutorial. */
export function PowerXTutorialCta({ locale, className }: { locale: Locale; className?: string }) {
  const t = STRINGS[locale];

  return (
    <TutorialLink
      href={powerxTutorialPath(locale)}
      analyticsEvent="powerx_tutorial_section_opened"
      analyticsTarget="powerx-header"
      data-testid="powerx-tutorial-link"
      aria-label={`${t.eyebrow}: ${t.title}`}
      className={cn(
        'group flex min-h-11 items-center gap-3 rounded-md border border-border/30 px-3 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
        className,
      )}
    >
      <GraduationCap aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {t.eyebrow}
          <NewBadge aria-hidden>{t.badge}</NewBadge>
        </span>
        <span className="text-sm font-medium text-foreground">{t.title}</span>
      </span>
      <ArrowRight
        aria-hidden
        className="ml-auto hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
      />
    </TutorialLink>
  );
}
