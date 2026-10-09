import type { Metadata } from 'next';

import { TpcGroupingContent } from '@/components/ubenchx/TpcGroupingContent';
import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX: TPC per GPC Grouping';
const DESCRIPTION =
  'Measured TPC per GPC groupings on NVIDIA H100, H200, B200, B300, and GB200, found from thread-block cluster co-scheduling.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: enAlternates('/ubenchx/tpc-grouping'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/ubenchx/tpc-grouping`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxTpcGroupingPage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <div className="space-y-8">
          <UbenchxHub current="tpc-grouping" />
          <TpcGroupingContent />
        </div>
      </div>
    </main>
  );
}
