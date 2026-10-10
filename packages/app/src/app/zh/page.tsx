import type { Metadata } from 'next';

import { LandingPage } from '@/components/landing/landing-page';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n/i18n';
import { LANDING_META } from '@/lib/routing/tab-meta';
import { LANDING_META_ZH } from '@/lib/routing/tab-meta-zh';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  // Absolute, so the root layout's `| InferenceX by SemiAnalysis` template is not appended.
  title: { absolute: `${LANDING_META_ZH.title} | ${LANDING_META.brand}` },
  description: LANDING_META_ZH.description,
  alternates: zhAlternates('/'),
  openGraph: {
    title: `${LANDING_META_ZH.title} | AcceleratorX`,
    description: LANDING_META_ZH.description,
    url: `${SITE_URL}/zh`,
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    title: `${LANDING_META_ZH.title} | AcceleratorX`,
    description: LANDING_META_ZH.description,
  },
};

export default function ZhHomePage() {
  return <LandingPage locale="zh" />;
}
