import type { Metadata } from 'next';

import { BlogContent } from '@/components/blog/blog-content';
import { SITE_URL } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Deep dives into inference benchmarking, GPU performance, and the economics of AI compute from the InferenceX team at SemiAnalysis.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: 'Blog | InferenceX by SemiAnalysis',
    description:
      'Deep dives into inference benchmarking, GPU performance, and the economics of AI compute.',
    url: `${SITE_URL}/blog`,
  },
};

export default function BlogPage() {
  return <BlogContent />;
}
