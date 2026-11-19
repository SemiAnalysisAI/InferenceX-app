import type { Metadata } from 'next';

import { QuotesContent } from '@/components/quotes/quotes-content';
import { enAlternates } from '@/lib/i18n/i18n';
import { socialMetadata } from '@/lib/seo/social-metadata';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

const DESCRIPTION =
  'InferenceX is backed by compute buyers and ML community members from MiniMax, Moonshot Kimi, Alibaba Qwen, OpenAI, Microsoft, vLLM, PyTorch and Oracle.';

export const metadata: Metadata = {
  title: 'Supporters',
  description: DESCRIPTION,
  alternates: enAlternates('/quotes'),
  ...socialMetadata({
    title: 'Supporters | InferenceX',
    description: DESCRIPTION,
    url: `${SITE_URL}/quotes`,
    locale: 'en',
  }),
};

export default function QuotesPage() {
  return <QuotesContent />;
}
