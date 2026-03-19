import type { Metadata } from 'next';

import { MediaContent } from '@/components/media/media-content';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: 'In the Media',
  description:
    "Media coverage of InferenceX (formerly InferenceMAX) by SemiAnalysis, featuring articles from NVIDIA, AMD, vLLM, Tom's Hardware, Barron's, LMSYS, and more.",
  alternates: { canonical: `${SITE_URL}/media` },
  openGraph: {
    title: 'In the Media | InferenceX by SemiAnalysis',
    description:
      "Media coverage of InferenceX — articles from NVIDIA, AMD, vLLM, Tom's Hardware, Barron's, LMSYS, and more.",
    url: `${SITE_URL}/media`,
  },
};

export default function InTheMediaPage() {
  return <MediaContent />;
}
