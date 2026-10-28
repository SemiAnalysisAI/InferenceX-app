import type { Metadata } from 'next';

import { CoreMemoryProfilesLazy } from '@/components/ubenchx/CoreMemoryProfilesLazy';
import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX：核心访存特征';
const DESCRIPTION =
  '对比 B200 SM 与 Huawei 950PR Cube/Vector 的访存特征，保留各设备原始计时单位和测试条件。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: zhAlternates('/ubenchx/core-memory-profiles'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/ubenchx/core-memory-profiles`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxCoreMemoryProfilesPageZh() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <div className="space-y-8">
          <UbenchxHub current="core-memory-profiles" />
          <CoreMemoryProfilesLazy />
        </div>
      </div>
    </main>
  );
}
