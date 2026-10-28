import type { Metadata } from 'next';

import { LandingPage } from '@/components/landing/landing-page';
import { zhAlternates } from '@/lib/i18n/i18n';
import { LANDING_META } from '@/lib/routing/tab-meta';
import { LANDING_META_ZH } from '@/lib/routing/tab-meta-zh';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: { absolute: `${LANDING_META_ZH.title} | ${LANDING_META.brand}` },
  description: LANDING_META_ZH.description,
  alternates: zhAlternates('/'),
  ...socialMetadata({
    title: `${LANDING_META_ZH.title} | AcceleratorX`,
    description: LANDING_META_ZH.description,
    url: `${SITE_URL}/zh`,
    locale: 'zh',
  }),
};

export default function ZhHomePage() {
  return <LandingPage locale="zh" />;
}
