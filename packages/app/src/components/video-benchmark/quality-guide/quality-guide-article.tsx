import type { ReactNode } from 'react';

import { TutorialArticle } from '@/components/tutorial/tutorial-article';
import { type Locale, localePath } from '@/lib/i18n/i18n';
import { getDashboardRoute } from '@/lib/routing/dashboard-routes';
import type { TutorialMeta } from '@/lib/tutorial/tutorial-content';

const STRINGS = {
  en: { eyebrow: 'Guide', back: '← VideoGenX' },
  zh: { eyebrow: '指南', back: '← VideoGenX' },
} as const;

export function VideoQualityGuideArticle({
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
        href: localePath(getDashboardRoute('video').path, locale),
        label: t.back,
        analyticsEvent: 'video_quality_guide_returned',
        analyticsTarget: 'vgx',
      }}
      testId="video-quality-guide"
    />
  );
}
