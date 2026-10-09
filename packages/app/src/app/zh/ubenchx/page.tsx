import type { Metadata } from 'next';

import { UbenchxContent } from '@/components/ubenchx/UbenchxContent';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX 显存拷贝带宽';
const DESCRIPTION =
  '在 NVIDIA 和 AMD GPU 上测量显存拷贝带宽的微基准测试：展示从 8 B 到 16 GiB 各消息大小下的延迟、带宽和显存带宽利用率（MBU）。';

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
        <UbenchxContent />
      </div>
    </main>
  );
}
