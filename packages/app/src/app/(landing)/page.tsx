import type { Metadata } from 'next';

import { LandingPage } from '@/components/landing/landing-page';
import { enAlternates } from '@/lib/i18n/i18n';
import { LANDING_META } from '@/lib/routing/tab-meta';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: { absolute: `${LANDING_META.title} | ${LANDING_META.brand}` },
  description: LANDING_META.description,
  alternates: enAlternates('/'),
  ...socialMetadata({
    title: `${LANDING_META.title} | AcceleratorX`,
    description: LANDING_META.description,
    url: SITE_URL,
    locale: 'en',
  }),
};

export default function HomePage() {
  return <LandingPage />;
}
