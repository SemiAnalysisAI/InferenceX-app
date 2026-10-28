import type { Metadata } from 'next';

import { QuotesContent } from '@/components/quotes/quotes-content';
import { zhAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  'InferenceX 获得了众多大型算力采购方和 ML 社区知名人士的认可。以下评价来自 MiniMax、Moonshot Kimi、Alibaba Qwen、OpenAI、Microsoft、vLLM、PyTorch Foundation 和 Oracle 等机构的相关人士。';

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
