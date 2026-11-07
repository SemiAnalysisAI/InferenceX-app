import type { ReactNode } from 'react';

import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

type CalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

const STRINGS: Record<Locale, Record<CalloutKind, string>> = {
  en: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
  zh: { note: '提示', tip: '技巧', important: '重要', warning: '警告', caution: '注意' },
};

/** Only warnings carry status color; the other kinds read from their label. */
const LABEL_TONE: Record<CalloutKind, string> = {
  note: 'text-foreground',
  tip: 'text-foreground',
  important: 'text-foreground',
  warning: 'text-warning',
  caution: 'text-destructive',
};

export interface TutorialCalloutProps {
  kind: CalloutKind;
  locale: Locale;
  children?: ReactNode;
}

/** A quiet aside on a muted surface step, without a colored rule or card border. */
export function TutorialCallout({ kind, locale, children }: TutorialCalloutProps) {
  return (
    <aside
      data-callout={kind}
      className="not-prose my-8 max-w-[72ch] rounded-lg bg-muted/40 px-5 py-4 text-base leading-7 text-muted-foreground [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_code]:text-foreground [&_p]:my-0 [&_strong]:text-foreground"
    >
      <p className={cn('mb-1 text-sm font-medium', LABEL_TONE[kind])}>{STRINGS[locale][kind]}</p>
      {children}
    </aside>
  );
}
