import type { Metadata } from 'next';

import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX 微基准测试';
const DESCRIPTION = '底层 GPU 微基准测试，测量基础硬件特性：显存拷贝带宽、SM 间 L2 延迟拓扑等。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: zhAlternates('/ubenchx'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/ubenchx`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxPageZh() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <UbenchxHub />
      </div>
    </main>
  );
}
