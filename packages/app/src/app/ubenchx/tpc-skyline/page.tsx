import type { Metadata } from 'next';

import { TpcSkylineContent } from '@/components/ubenchx/TpcSkylineContent';
import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { enAlternates } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX: TPC Skyline & SKU configurations';
const DESCRIPTION =
  'Measured NVIDIA TPC per GPC groupings alongside Huawei 950PR SKU configuration counts, clocks, memory and cache capacities.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: enAlternates('/ubenchx/tpc-skyline'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/ubenchx/tpc-skyline`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxTpcSkylinePage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <div className="space-y-8">
          <UbenchxHub current="tpc-skyline" />
          <TpcSkylineContent />
        </div>
      </div>
    </main>
  );
}
