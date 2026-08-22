import type { Metadata } from 'next';

import { QuotesContent } from '@/components/quotes/quotes-content';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: '业界与社区评价',
  description:
    'InferenceX 获得了众多大型算力采购方和 ML 社区知名人士的认可。以下评价来自 MiniMax、Moonshot Kimi、Alibaba Qwen、OpenAI、Microsoft、vLLM、PyTorch Foundation 和 Oracle 等机构的相关人士。',
  alternates: zhAlternates('/quotes'),
  openGraph: {
    title: '业界与社区评价 | InferenceX by SemiAnalysis',
    description:
      'InferenceX 获得了众多大型算力采购方和 ML 社区知名人士的认可。以下评价来自 MiniMax、Moonshot Kimi、Alibaba Qwen、OpenAI、Microsoft、vLLM、PyTorch Foundation 和 Oracle 等机构的相关人士。',
    url: `${SITE_URL}/zh/quotes`,
    locale: ZH_OG_LOCALE,
  },
};

export default function ZhQuotesPage() {
  return <QuotesContent locale="zh" />;
}
