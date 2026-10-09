import type { Metadata } from 'next';

import { UbenchxContent } from '@/components/ubenchx/UbenchxContent';
import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX：HBM 带宽';
const DESCRIPTION =
  '在 NVIDIA 和 AMD GPU 上测量显存拷贝带宽的微基准测试：展示从 8 B 到 16 GiB 各消息大小下的延迟、带宽和显存带宽利用率（MBU）。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: zhAlternates('/ubenchx/mem-bw'),
  robots: { index: false, follow: false },
  openGraph: {
    title: `${TITLE} | InferenceX`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/ubenchx/mem-bw`,
    locale: ZH_OG_LOCALE,
  },
  twitter: { title: `${TITLE} | InferenceX`, description: DESCRIPTION },
};

export default function UbenchxMemBwPageZh() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 pb-8 lg:px-8">
        <div className="space-y-8">
          <UbenchxHub current="mem-bw" />
          <UbenchxContent />
        </div>
      </div>
    </main>
  );
}
