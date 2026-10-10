import type { Metadata } from 'next';

import { SmL2Content } from '@/components/ubenchx/SmL2Heatmap';
import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { enAlternates } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX: SM-SM L2 Latency Difference';
const DESCRIPTION =
  'L2 pointer-chase microbenchmark showing SM-to-SM latency differences, revealing GPC and die topology structure on NVIDIA Blackwell GPUs.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: enAlternates('/ubenchx/sm-l2-distance'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/ubenchx/sm-l2-distance`,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxSmL2DistancePage() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <div className="space-y-8">
          <UbenchxHub current="sm-l2-distance" />
          <SmL2Content />
        </div>
      </div>
    </main>
  );
}
