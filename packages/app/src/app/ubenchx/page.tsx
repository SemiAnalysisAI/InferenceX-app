import type { Metadata } from 'next';

import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX Microbenchmarks';
const DESCRIPTION =
  'Low-level GPU microbenchmarks measuring fundamental hardware characteristics: device-memory copy bandwidth, SM-to-SM L2 latency topology, and more.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: enAlternates('/ubenchx'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/ubenchx`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <UbenchxHub />
      </div>
    </main>
  );
}
