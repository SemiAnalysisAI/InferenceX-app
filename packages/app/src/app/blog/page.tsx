import type { Metadata } from 'next';

import { BlogIndexContent } from '@/components/blog/blog-index-content';
import { JsonLd } from '@/components/seo/json-ld';
import { enAlternates } from '@/lib/i18n/i18n';
import { SITE_URL, SITE_NAME, AUTHOR_NAME } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

export const metadata: Metadata = {
  title: 'Articles',
  description: `Technical articles from ${SITE_NAME} by ${AUTHOR_NAME} on agentic inference benchmarks, AgentX results, chip performance, and ML infrastructure.`,
  alternates: enAlternates('/blog'),
  ...socialMetadata({
    title: `Articles | ${SITE_NAME}`,
    description: 'Articles on agentic inference benchmarks, AgentX results, and chip performance.',
    url: `${SITE_URL}/blog`,
    locale: 'en',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: `${SITE_NAME} Articles`,
  url: `${SITE_URL}/blog`,
  publisher: {
    '@type': 'Organization',
    name: AUTHOR_NAME,
  },
};

export default function BlogPage() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <BlogIndexContent locale="en" />
    </main>
  );
}
