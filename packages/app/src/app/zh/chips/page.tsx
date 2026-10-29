import type { Metadata } from 'next';

import { ChipsIndexContent } from '@/components/chips/chip-page-sections';
import { zhAlternates } from '@/lib/i18n/i18n';
import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

const TITLE = '面向 LLM 推理的 AI 芯片：规格、价格与基准测试';
const DESCRIPTION =
  'NVIDIA H100、H200、B200、B300、GB200 NVL72、GB300 NVL72 与 AMD MI300X、MI325X、MI355X 的芯片规格、云端价格与持续测量的 LLM 推理基准测试。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'AI 芯片',
    'AI 芯片对比',
    'GPU 规格',
    'GPU 每小时价格',
    'LLM 推理硬件',
    'NVIDIA 对比 AMD',
    '数据中心芯片价格',
    'AI 加速器对比',
  ],
  alternates: zhAlternates('/chips'),
  ...socialMetadata({
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/chips`,
    locale: 'zh',
  }),
};

export default function ZhChipsIndexPage() {
  return <ChipsIndexContent locale="zh" />;
}
