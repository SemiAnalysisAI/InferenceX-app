import type { ReactNode } from 'react';

import { TutorialArticle } from '@/components/tutorial/tutorial-article';
import { type Locale, localePath } from '@/lib/i18n/i18n';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';
import type { TutorialMeta } from '@/lib/tutorial/tutorial-content';

const STRINGS = {
  en: { eyebrow: 'Tutorial', back: '← PowerX' },
  zh: { eyebrow: '教程', back: '← PowerX' },
} as const;

export function PowerXTutorialArticle({
  locale,
  meta,
  content,
}: {
  locale: Locale;
  meta: TutorialMeta;
  content: ReactNode;
}) {
  const t = STRINGS[locale];
  return (
    <TutorialArticle
      locale={locale}
      meta={meta}
      content={content}
      eyebrow={t.eyebrow}
      back={{
        href: localePath(getDashboardRoute('powerx').path, locale),
        label: t.back,
        analyticsEvent: 'powerx_tutorial_returned',
        analyticsTarget: 'powerx',
      }}
      testId="powerx-tutorial"
    />
  );
}
