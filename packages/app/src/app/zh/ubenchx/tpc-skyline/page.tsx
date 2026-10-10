import type { Metadata } from 'next';

import { TpcSkylineContent } from '@/components/ubenchx/TpcSkylineContent';
import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX：TPC Skyline';
const DESCRIPTION = '基于线程块集群协同调度，实测 NVIDIA GPU 的 TPC per GPC 分组。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: zhAlternates('/ubenchx/tpc-skyline'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/ubenchx/tpc-skyline`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxTpcSkylinePageZh() {
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
