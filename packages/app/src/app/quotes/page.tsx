import type { Metadata } from 'next';

import { QuotesContent } from '@/components/quotes/quotes-content';
import { enAlternates } from '@/lib/i18n';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: 'Supporters',
  description:
    'InferenceX initiative is supported by major buyers of compute and prominent members of the ML community including those from MiniMax, Moonshot Kimi, Alibaba Qwen, OpenAI, Microsoft, vLLM, PyTorch Foundation, Oracle and more.',
  alternates: enAlternates('/quotes'),
  openGraph: {
    title: 'Supporters | InferenceX by SemiAnalysis',
    description:
      'Supported by MiniMax, Moonshot Kimi, Alibaba Qwen, OpenAI, Microsoft, vLLM, PyTorch Foundation, Oracle, and prominent members of the ML community.',
    url: `${SITE_URL}/quotes`,
  },
};

export default function QuotesPage() {
  return <QuotesContent />;
}
