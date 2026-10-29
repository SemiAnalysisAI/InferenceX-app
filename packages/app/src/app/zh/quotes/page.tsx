import type { Metadata } from 'next';

import { QuotesContent } from '@/components/quotes/quotes-content';
import { zhAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  '大型算力采购方与 ML 社区对 InferenceX 的评价，来自 MiniMax、Moonshot Kimi、Alibaba Qwen、OpenAI、Microsoft、vLLM、PyTorch Foundation、Oracle 等。';

export const metadata: Metadata = {
  title: '业界与社区评价',
  description: DESCRIPTION,
  alternates: zhAlternates('/quotes'),
  ...socialMetadata({
    title: '业界与社区评价 | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/zh/quotes`,
    locale: 'zh',
  }),
};

export default function ZhQuotesPage() {
  return <QuotesContent locale="zh" />;
}
