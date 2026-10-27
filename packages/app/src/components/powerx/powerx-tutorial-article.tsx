import type { ReactNode } from 'react';

import { BLOG_PROSE_CLASS } from '@/components/blog/blog-prose';
import { HashScroll } from '@/components/blog/hash-scroll';
import { formatBlogDate } from '@/lib/blog/blog';
import { type Locale, localePath } from '@/lib/i18n/i18n';
import { POWERX_PATH, type PowerXTutorialMeta } from '@/lib/powerx/tutorial';
import { cn } from '@/lib/shared/utils';

import { PowerXTutorialLink } from './powerx-tutorial-link';

const STRINGS = {
  en: { eyebrow: 'Tutorial', back: '← PowerX', updated: 'Updated' },
  zh: { eyebrow: '教程', back: '← PowerX', updated: '更新于' },
} as const;

/**
 * One reading column with wider section rhythm than the blog; widgets escape it through their
 * own `data-layout` wrapper. FAQ `<details>` and the section-numbered H2s are styled here.
 */
const TUTORIAL_PROSE_CLASS = cn(
  BLOG_PROSE_CLASS,
  'prose-p:text-base prose-p:leading-7 prose-li:my-1',
  'prose-h2:mt-24 prose-h2:mb-6 prose-h2:text-3xl prose-h2:font-semibold prose-h2:tracking-tight sm:prose-h2:text-4xl',
  'prose-table:my-6 prose-td:align-top [&_td:first-child]:whitespace-nowrap',
  '[&>details]:max-w-[72ch] [&>details]:border-t [&>details]:border-border/60 [&>details:last-of-type]:border-b',
  '[&>details>summary]:flex [&>details>summary]:min-h-11 [&>details>summary]:cursor-pointer [&>details>summary]:list-none [&>details>summary]:items-baseline [&>details>summary]:justify-between [&>details>summary]:gap-4 [&>details>summary]:py-3 [&>details>summary]:text-base [&>details>summary]:font-medium [&>details>summary]:text-foreground [&>details>summary::-webkit-details-marker]:hidden',
  // The FAQ `<details>` come from the markdown untouched, so the "+" chevron is drawn here.
  "[&>details>summary]:after:inline-block [&>details>summary]:after:shrink-0 [&>details>summary]:after:text-muted-foreground [&>details>summary]:after:content-['+'] [&>details[open]>summary]:after:rotate-45",
  '[&>details>p]:mt-0 [&>details>p]:mb-4 [&>details>p]:text-muted-foreground',
);

export interface PowerXTutorialArticleProps {
  locale: Locale;
  meta: PowerXTutorialMeta;
  content: ReactNode;
}

export function PowerXTutorialArticle({ locale, meta, content }: PowerXTutorialArticleProps) {
  const t = STRINGS[locale];

  return (
    <article data-testid="powerx-tutorial-article">
      <HashScroll />
      <header className="pt-4 sm:pt-8">
        <PowerXTutorialLink
          href={localePath(POWERX_PATH, locale)}
          analyticsEvent="powerx_tutorial_returned"
          analyticsTarget="powerx"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t.back}
        </PowerXTutorialLink>
        <p className="mt-10 font-mono text-xs font-semibold tracking-eyebrow-wide text-brand uppercase">
          {t.eyebrow}
        </p>
        <h1
          className={cn(
            'mt-4 text-4xl font-semibold tracking-heading text-balance text-foreground sm:text-5xl',
            locale === 'en' && 'max-w-[22ch] lg:text-6xl',
          )}
        >
          {meta.title}
        </h1>
        <p className="mt-6 max-w-[58ch] text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
          {meta.description}
        </p>
        <p className="mt-5 font-mono text-xs text-muted-foreground">
          {t.updated} <time dateTime={meta.updated}>{formatBlogDate(meta.updated, locale)}</time>
        </p>
      </header>

      <div className={cn(TUTORIAL_PROSE_CLASS, 'mt-12')} data-testid="powerx-tutorial-body">
        {content}
      </div>
    </article>
  );
}
