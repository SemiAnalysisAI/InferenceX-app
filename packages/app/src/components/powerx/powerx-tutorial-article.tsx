import type { ReactNode } from 'react';

import { BLOG_PROSE_CLASS } from '@/components/blog/blog-prose';
import { HashScroll } from '@/components/blog/hash-scroll';
import { formatBlogDate, type TocHeading } from '@/lib/blog/blog';
import { type Locale, localePath } from '@/lib/i18n/i18n';
import { POWERX_PATH, type PowerXTutorialMeta } from '@/lib/powerx/tutorial';
import { cn } from '@/lib/shared/utils';

import { PowerXTutorialLink } from './powerx-tutorial-link';

const STRINGS = {
  en: {
    eyebrow: 'PowerX tutorial',
    back: '← PowerX',
    onThisPage: 'On this page',
    updated: 'Updated',
  },
  zh: { eyebrow: 'PowerX 教程', back: '← PowerX', onThisPage: '本页内容', updated: '更新于' },
} as const;

const TUTORIAL_PROSE_CLASS = cn(
  BLOG_PROSE_CLASS,
  'prose-table:my-5 prose-td:align-top [&_td:first-child]:whitespace-nowrap',
);

export interface PowerXTutorialArticleProps {
  locale: Locale;
  meta: PowerXTutorialMeta;
  headings: TocHeading[];
  content: ReactNode;
}

export function PowerXTutorialArticle({
  locale,
  meta,
  headings,
  content,
}: PowerXTutorialArticleProps) {
  const t = STRINGS[locale];
  const sections = headings.filter((heading) => heading.level === 2);

  return (
    <article data-testid="powerx-tutorial-article">
      <HashScroll />
      <header className="border-b border-border/70 pb-8">
        <PowerXTutorialLink
          href={localePath(POWERX_PATH, locale)}
          analyticsEvent="powerx_tutorial_returned"
          analyticsTarget="powerx"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t.back}
        </PowerXTutorialLink>
        <p className="mt-8 font-mono text-xs font-semibold tracking-eyebrow-wide text-brand uppercase">
          {t.eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {meta.title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{meta.description}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          {t.updated} <time dateTime={meta.updated}>{formatBlogDate(meta.updated, locale)}</time>
        </p>
      </header>

      {sections.length > 0 && (
        <nav aria-label={t.onThisPage} className="mt-10">
          <p className="font-mono text-xs font-semibold tracking-eyebrow text-brand uppercase">
            {t.onThisPage}
          </p>
          <ul className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {sections.map((heading) => (
              <li key={heading.id}>
                <PowerXTutorialLink
                  href={`#${heading.id}`}
                  analyticsEvent="powerx_tutorial_section_opened"
                  analyticsTarget={heading.id}
                  className="text-sm leading-6 text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                >
                  {heading.text}
                </PowerXTutorialLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className={cn(TUTORIAL_PROSE_CLASS, 'mt-6')} data-testid="powerx-tutorial-body">
        {content}
      </div>
    </article>
  );
}
