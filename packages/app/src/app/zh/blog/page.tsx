import type { Metadata } from 'next';
import Link from 'next/link';

import { BlogPostCard } from '@/components/blog/blog-post-card';
import { BlogTagLink } from '@/components/blog/blog-tag-link';
import { Card } from '@/components/ui/card';
import { JsonLd } from '@/components/json-ld';
import { getAllPosts } from '@/lib/blog';
import { ZH_LANG_TAG, ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';
import { SITE_URL, SITE_NAME, AUTHOR_NAME } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: '文章',
  description: `${SITE_NAME} by ${AUTHOR_NAME} 的技术文章——AI 推理基准测试、GPU 性能分析与 ML 基础设施洞见。`,
  alternates: zhAlternates('/blog'),
  openGraph: {
    title: `文章 | ${SITE_NAME} by ${AUTHOR_NAME}`,
    description: 'AI 推理基准测试洞见与 GPU 性能分析。',
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
  const posts = getAllPosts('zh');
  const allTags = [...new Set(posts.flatMap((p) => p.tags ?? []))].toSorted();
  const filtered = activeTag ? posts.filter((p) => p.tags?.includes(activeTag)) : posts;

  return (
    <main className="relative">
      <JsonLd data={jsonLd} />
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <section className="flex flex-col gap-4">
          <Card>
            <h2 className="text-2xl lg:text-4xl font-bold tracking-tight">文章</h2>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">
              关于 AI 推理基准测试、GPU 性能与 ML 基础设施的深度洞见。
            </p>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                <Link
                  href="/zh/blog"
                  className={`rounded-full px-3 py-0.5 text-xs transition-colors ${
                    activeTag
                      ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                      : 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  }`}
                >
                  全部
                </Link>
                {allTags.map((tag) => (
                  <BlogTagLink key={tag} tag={tag} active={activeTag === tag} basePath="/zh/blog" />
                ))}
              </div>
            )}
            <div className="mt-6 pt-6 border-t border-border/40">
              {filtered.length === 0 ? (
                <p className="text-muted-foreground">
                  {activeTag ? `没有标签为“${activeTag}”的文章。` : '即将上线。'}
                </p>
              ) : (
                <div className="flex flex-col gap-8">
                  {filtered.map((post) => (
                    <BlogPostCard
                      key={post.slug}
                      slug={post.slug}
                      title={post.title}
                      basePath="/zh/blog"
                    >
                      <article className="min-w-0">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                          <time dateTime={post.date}>
                            {new Date(`${post.date}T00:00:00Z`).toLocaleDateString('zh-CN', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              timeZone: 'UTC',
                            })}
                          </time>
                          <span>&middot;</span>
                          <span>{post.readingTime} 分钟阅读</span>
                        </div>
                        <h2 className="text-2xl font-semibold mb-2 group-hover:underline group-hover:text-brand">
                          {post.title}
                        </h2>
                        <p className="text-muted-foreground mb-3">{post.subtitle}</p>
                        {post.tags && post.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {post.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    </BlogPostCard>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
