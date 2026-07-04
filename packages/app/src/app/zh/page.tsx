import type { Metadata } from 'next';

import { LandingPage } from '@/components/landing/landing-page';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { LANDING_META_ZH } from '@/lib/tab-meta-zh';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: LANDING_META_ZH.title,
  description: LANDING_META_ZH.description,
  alternates: zhAlternates('/'),
  openGraph: {
    title: `${LANDING_META_ZH.title} | InferenceX`,
    description: LANDING_META_ZH.description,
    url: `${SITE_URL}/zh`,
    locale: ZH_OG_LOCALE,
  },
  twitter: {
    title: `${LANDING_META_ZH.title} | InferenceX`,
    description: LANDING_META_ZH.description,
  },
};

export default function ZhHomePage() {
  return <LandingPage locale="zh" />;
}
