import type { Metadata } from 'next';

import { CoreMemoryProfilesContent } from '@/components/ubenchx/CoreMemoryProfilesContent';
import { UbenchxHub } from '@/components/ubenchx/UbenchxHub';
import { zhAlternates, ZH_OG_LOCALE } from '@/lib/i18n/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const TITLE = 'ubenchX：核心访存特征';
const DESCRIPTION =
  '展示 Ascend 950PR 的 Cube 与 Vector 标量控制器在 128 MiB 内存上的访存特征差异，包含单核执行与并发启动结果。';

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
          <CoreMemoryProfilesContent />
        </div>
      </div>
    </main>
  );
}
