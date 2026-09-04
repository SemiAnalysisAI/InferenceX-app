'use client';

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
      className="no-export text-foreground underline underline-offset-2 hover:text-brand focus-visible:outline-none"
    >
      {label}
    </a>
  );
}
