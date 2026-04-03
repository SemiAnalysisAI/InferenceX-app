import type { Metadata } from 'next';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { CurrentImageContent } from '@/components/latest-image/latest-image-content';

export const metadata: Metadata = {
  title: 'Current InferenceX Image',
  description: 'Current InferenceX Docker image tags for each model, GPU SKU, and configuration.',
  alternates: { canonical: `${SITE_URL}/current-inferencex-image` },
  openGraph: {
    title: 'Current InferenceX Image | InferenceX by SemiAnalysis',
    description: 'Current InferenceX Docker image tags for each model, GPU SKU, and configuration.',
    url: `${SITE_URL}/current-inferencex-image`,
  },
};

export default function CurrentInferenceXImagePage() {
  return <CurrentImageContent />;
}
