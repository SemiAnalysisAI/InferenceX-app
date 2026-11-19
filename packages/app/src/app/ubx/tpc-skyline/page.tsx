import type { Metadata } from 'next';

import { TpcSkylineContent } from '@/components/ubenchx/TpcSkylineContent';
import { enAlternates } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'uBenchX: TPC Skyline & SKU configurations';
const DESCRIPTION =
  'Measured NVIDIA TPC per GPC groupings alongside Huawei 950PR SKU configuration counts, clocks, memory and cache capacities.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: enAlternates('/ubx/tpc-skyline'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/ubx/tpc-skyline`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxTpcSkylinePage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8">
        <TpcSkylineContent />
      </div>
    </main>
  );
}
