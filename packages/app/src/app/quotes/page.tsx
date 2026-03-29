import type { Metadata } from 'next';

import { QuotesContent } from '@/components/quotes/quotes-content';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: 'Supporters',
  description:
    'InferenceX initiative is supported by major buyers of compute and prominent members of the ML community including those from OpenAI, Microsoft, PyTorch Foundation, and more.',
  alternates: { canonical: `${SITE_URL}/quotes` },
  openGraph: {
    title: 'Supporters | InferenceX by SemiAnalysis',
    description:
      'Supported by OpenAI, Microsoft, PyTorch Foundation, and prominent members of the ML community.',
    url: `${SITE_URL}/quotes`,
  },
};

export default function QuotesPage() {
  return <QuotesContent />;
}
