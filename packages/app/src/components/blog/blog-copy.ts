import type { Locale } from '@/lib/i18n';

/**
 * Hand-written UI strings for the article index and post pages. Both locales
 * live side by side so a change to one surface is made in both languages at
 * once. Article bodies themselves come from MDX and are not covered here.
 */
export const BLOG_COPY = {
  en: {
    indexEyebrow: 'InferenceX Research',
    indexTitle: 'Articles',
    indexIntro:
      'Benchmark write-ups on agentic inference, AgentX results, and chip and serving-stack economics.',
    glossaryLead: 'New to the terminology?',
    glossaryLink: 'Browse the AI inference glossary',
    featured: 'Latest',
    readArticle: 'Read article',
    allPosts: 'All articles',
    allTag: 'All',
    moreTags: 'More tags',
    filterLabel: 'Filter by tag',
    tags: 'Tags',
    count: (n: number) => (n === 1 ? '1 article' : `${n} articles`),
    taggedHeading: (tag: string) => `Tagged “${tag}”`,
    clearFilter: 'Show all articles',
    emptyTag: (tag: string) => `No articles tagged “${tag}”.`,
    emptyAll: 'Coming soon.',
    readingTime: (minutes: number) => `${minutes} min read`,
    updated: (date: string) => `Updated ${date}`,
    backToIndex: 'Back to articles',
    onThisPage: 'On this page',
    share: 'Share',
    copyLink: 'Copy link',
    copied: 'Copied',
    ctaEyebrow: 'Live data',
    ctaTitle: 'See the AgentX results behind these articles',
    ctaBody:
      'Every chart on this site is built from public benchmark runs. Compare chips, engines, and precisions on the live dashboard.',
    ctaButton: 'Open the dashboard',
    prev: 'Previous',
    next: 'Next',
    moreArticles: 'More articles',
    readOriginal: 'Read the English original',
    copyright:
      'All articles and posts are © SemiAnalysis. All rights reserved. The AGPL-3.0 license covering the application source code does not apply to article content.',
  },
  zh: {
    indexEyebrow: 'InferenceX 研究',
    indexTitle: '文章',
    indexIntro: '关于智能体推理、AgentX 结果、芯片与推理框架经济性的基准测试文章。',
    glossaryLead: '不熟悉相关概念？',
    glossaryLink: '浏览 AI 推理术语表',
    featured: '最新',
    readArticle: '阅读全文',
    allPosts: '全部文章',
    allTag: '全部',
    moreTags: '更多标签',
    filterLabel: '按标签筛选',
    tags: '标签',
    count: (n: number) => `${n} 篇文章`,
    taggedHeading: (tag: string) => `标签：${tag}`,
    clearFilter: '显示全部文章',
    emptyTag: (tag: string) => `没有标签为“${tag}”的文章。`,
    emptyAll: '即将上线。',
    readingTime: (minutes: number) => `预计阅读 ${minutes} 分钟`,
    updated: (date: string) => `更新于 ${date}`,
    backToIndex: '返回文章列表',
    onThisPage: '本页目录',
    share: '分享',
    copyLink: '复制链接',
    copied: '已复制',
    ctaEyebrow: '实时数据',
    ctaTitle: '查看这些文章背后的 AgentX 结果',
    ctaBody: '本站所有图表均来自公开基准测试运行。在实时仪表板中比较芯片、推理引擎与精度。',
    ctaButton: '打开仪表板',
    prev: '上一篇',
    next: '下一篇',
    moreArticles: '更多文章',
    readOriginal: '阅读英文原文',
    copyright:
      '本文由英文原文翻译而来，如有歧义以英文版为准。所有文章版权归 © SemiAnalysis 所有，保留所有权利。覆盖应用源代码的 AGPL-3.0 许可证不适用于文章内容。',
  },
} satisfies Record<Locale, unknown>;

export type BlogCopy = (typeof BLOG_COPY)[Locale];

export function blogIndexPath(locale: Locale): string {
  return locale === 'zh' ? '/zh/blog' : '/blog';
}
