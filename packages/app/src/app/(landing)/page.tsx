import type { Metadata } from 'next';

import { LandingPage } from '@/components/landing/landing-page';
import { enAlternates } from '@/lib/i18n';
import { LANDING_META } from '@/lib/tab-meta';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: LANDING_META.title,
  description: LANDING_META.description,
  alternates: enAlternates('/'),
  openGraph: {
    title: `${LANDING_META.title} | InferenceX`,
    description: LANDING_META.description,
    url: SITE_URL,
  },
  twitter: {
    title: `${LANDING_META.title} | InferenceX`,
    description: LANDING_META.description,
  },
};

export default function HomePage() {
  return <LandingPage />;
}
