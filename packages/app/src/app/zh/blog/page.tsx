import type { Metadata } from 'next';

import { BlogIndexContent } from '@/components/blog/blog-index-content';
import { JsonLd } from '@/components/json-ld';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { SITE_URL, SITE_NAME, AUTHOR_NAME } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: '文章',
  description: `${AUTHOR_NAME} 通过 ${SITE_NAME} 发布技术文章，涵盖智能体推理基准测试、AgentX 结果、芯片性能和 ML 基础设施。`,
  alternates: zhAlternates('/blog'),
  openGraph: {
    title: `文章 | ${SITE_NAME} by ${AUTHOR_NAME}`,
    description: '关于智能体推理基准测试、AgentX 结果与芯片性能的文章。',
    url: `${SITE_URL}/zh/blog`,
    locale: ZH_OG_LOCALE,
  },
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

export default async function ZhBlogPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag: activeTag } = await searchParams;

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <BlogIndexContent locale="zh" activeTag={activeTag} />
    </main>
  );
}
