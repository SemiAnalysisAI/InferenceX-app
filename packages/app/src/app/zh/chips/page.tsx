import type { Metadata } from 'next';

import { ChipsIndexContent } from '@/components/chips/chip-page-sections';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { SITE_NAME, SITE_URL, SUPPORTERS_LINE_ZH } from '@semianalysisai/inferencex-constants';

const TITLE = '面向 LLM 推理的 AI 芯片：规格、价格与基准测试';
const DESCRIPTION = `NVIDIA Hopper 与 Blackwell（H100、H200、B200、B300、GB200 NVL72、GB300 NVL72）以及 AMD Instinct（MI300X、MI325X、MI355X）芯片的规格、云端价格与持续测量的 LLM 推理基准测试。${SUPPORTERS_LINE_ZH}`;

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
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/chips`,
    locale: ZH_OG_LOCALE,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
};

export default function ZhChipsIndexPage() {
  return <ChipsIndexContent locale="zh" />;
}
