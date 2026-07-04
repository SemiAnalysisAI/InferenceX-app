import type { Metadata } from 'next';

import { QuotesContent } from '@/components/quotes/quotes-content';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: '支持者',
  description:
    'InferenceX 计划获得众多主要算力买家与 ML 社区知名成员的支持，包括来自 MiniMax、Moonshot Kimi、阿里巴巴 Qwen、OpenAI、Microsoft、vLLM、PyTorch 基金会、Oracle 等机构的支持者。',
  alternates: zhAlternates('/quotes'),
  openGraph: {
    title: '支持者 | InferenceX by SemiAnalysis',
    description:
      '获得 MiniMax、Moonshot Kimi、阿里巴巴 Qwen、OpenAI、Microsoft、vLLM、PyTorch 基金会、Oracle 及 ML 社区知名成员的支持。',
    url: `${SITE_URL}/zh/quotes`,
    locale: ZH_OG_LOCALE,
  },
};

export default function ZhQuotesPage() {
  return <QuotesContent locale="zh" />;
}
