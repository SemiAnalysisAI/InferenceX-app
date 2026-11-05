import type { ReactNode } from 'react';

import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

type CalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const STRINGS: Record<Locale, Record<CalloutKind, string>> = {
  en: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
  zh: { note: '提示', tip: '技巧', important: '重要', warning: '警告', caution: '注意' },
};

const RULE: Record<CalloutKind, string> = {
  note: 'border-brand/60',
  tip: 'border-brand/60',
  important: 'border-foreground/60',
  warning: 'border-destructive/70',
  caution: 'border-destructive/70',
};

export interface TutorialCalloutProps {
  kind: CalloutKind;
  locale: Locale;
  children?: ReactNode;
}

/** A ruled aside, not a card. */
export function TutorialCallout({ kind, locale, children }: TutorialCalloutProps) {
  return (
    <aside
      data-callout={kind}
      className={cn(
        'not-prose my-8 max-w-[72ch] border-l-2 pl-5 text-base leading-7 text-muted-foreground [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_code]:text-foreground [&_p]:my-0 [&_strong]:text-foreground',
        RULE[kind],
      )}
    >
      <p className="mb-1 font-mono text-xs font-semibold tracking-eyebrow text-foreground uppercase">
        {STRINGS[locale][kind]}
      </p>
      {children}
    </aside>
  );
}
