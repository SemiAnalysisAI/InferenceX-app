import type { ReactNode } from 'react';
import { CircleAlert, Info, Lightbulb, OctagonAlert, TriangleAlert } from 'lucide-react';

import type { Locale } from '@/lib/i18n/i18n';
import type { GitHubAlertKind } from '@/lib/powerx/remark-github-alerts';
import { cn } from '@/lib/shared/utils';

const STRINGS: Record<Locale, Record<GitHubAlertKind, string>> = {
  en: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
  zh: { note: '提示', tip: '技巧', important: '重要', warning: '警告', caution: '注意' },
};

const ICONS: Record<GitHubAlertKind, typeof Info> = {
  note: Info,
  tip: Lightbulb,
  important: CircleAlert,
  warning: TriangleAlert,
  caution: OctagonAlert,
};

const TONE: Record<GitHubAlertKind, string> = {
  note: 'text-brand',
  tip: 'text-brand',
  important: 'text-primary',
  warning: 'text-destructive',
  caution: 'text-destructive',
};

export interface TutorialCalloutProps {
  'data-callout'?: string;
  locale?: Locale;
  children?: ReactNode;
}

function isKind(value: string | undefined): value is GitHubAlertKind {
  return value !== undefined && value in ICONS;
}

/** Renders `aside[data-callout]` from the remark alerts plugin as a bordered callout. */
export function TutorialCallout({
  'data-callout': kind,
  locale = 'en',
  children,
}: TutorialCalloutProps) {
  if (!isKind(kind)) return <aside>{children}</aside>;
  const Icon = ICONS[kind];
  return (
    <aside
      data-callout={kind}
      className="not-prose my-6 max-w-[72ch] rounded-lg border border-border bg-muted/40 px-4 py-3 text-base leading-7 text-muted-foreground [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_code]:text-foreground [&_p]:my-0 [&_strong]:text-foreground"
    >
      <p className={cn('mb-1 flex items-center gap-2 text-sm font-semibold', TONE[kind])}>
        <Icon aria-hidden="true" className="size-4" />
        {STRINGS[locale][kind]}
      </p>
      {children}
    </aside>
  );
}
