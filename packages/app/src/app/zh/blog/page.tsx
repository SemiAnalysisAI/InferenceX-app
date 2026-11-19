import type { Metadata } from 'next';

import { BlogIndexContent } from '@/components/blog/blog-index-content';
import { JsonLd } from '@/components/seo/json-ld';
import { ZH_LANG_TAG, zhAlternates } from '@/lib/i18n/i18n';
import { SITE_URL, SITE_NAME, AUTHOR_NAME } from '@semianalysisai/inferencex-constants';
import { socialMetadata } from '@/lib/seo/social-metadata';

export const metadata: Metadata = {
  title: '文章',
  description: `${AUTHOR_NAME} 通过 ${SITE_NAME} 发布技术文章，涵盖智能体推理基准测试、AgentX 结果、芯片性能和 ML 基础设施。`,
  alternates: zhAlternates('/blog'),
  ...socialMetadata({
    title: `文章 | ${SITE_NAME}`,
    description: '关于智能体推理基准测试、AgentX 结果与芯片性能的文章。',
    url: `${SITE_URL}/zh/blog`,
    locale: 'zh',
  }),
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Blog',
  name: `${SITE_NAME} 文章`,
  url: `${SITE_URL}/zh/blog`,
  inLanguage: ZH_LANG_TAG,
  publisher: {
    '@type': 'Organization',
    name: AUTHOR_NAME,
  },
};

export default function ZhBlogPage() {
  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <BlogIndexContent locale="zh" />
    </main>
  );
}
