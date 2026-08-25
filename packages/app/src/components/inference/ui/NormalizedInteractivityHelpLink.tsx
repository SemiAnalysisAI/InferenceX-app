'use client';

import { CircleHelp } from 'lucide-react';

import { track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n';

const STRINGS = {
  en: 'What does E2E Normalized Interactivity mean?',
  zh: '什么是端到端归一化交互性？',
} as const;

export function NormalizedInteractivityHelpLink({ locale }: { locale: Locale }) {
  const label = STRINGS[locale];
  const href = `${locale === 'zh' ? '/zh' : ''}/about#faq-normalized-interactivity`;

  return (
    <a
      href={href}
      data-testid="normalized-interactivity-faq-link"
      aria-label={label}
      title={label}
      onClick={() => track('interactivity_normalized_faq_opened', { locale })}
      className="no-export absolute right-1 top-1/2 z-10 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/55 transition-colors hover:bg-muted hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
    >
      <CircleHelp aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
    </a>
  );
}
