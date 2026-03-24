import type { Metadata } from 'next';
import Link from 'next/link';

import { BlogPostCard } from '@/components/blog/blog-post-card';
import { BlogTagLink } from '@/components/blog/blog-tag-link';
import { Card } from '@/components/ui/card';
import { getAllPosts } from '@/lib/blog';
import { SITE_URL, SITE_NAME, AUTHOR_NAME } from '@semianalysisai/inferencex-constants';

export const metadata: Metadata = {
  title: 'Articles',
  description: `Technical articles from ${SITE_NAME} by ${AUTHOR_NAME} — AI inference benchmarking, GPU performance analysis, and ML infrastructure insights.`,
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: `Articles | ${SITE_NAME} by ${AUTHOR_NAME}`,
    description: 'AI inference benchmarking insights and GPU performance analysis.',
    url: `${SITE_URL}/blog`,
  },
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

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag: activeTag } = await searchParams;
  const posts = getAllPosts();
  const allTags = [...new Set(posts.flatMap((p) => p.tags ?? []))].sort();
  const filtered = activeTag ? posts.filter((p) => p.tags?.includes(activeTag)) : posts;

  return (
    <main className="relative">
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-16 lg:gap-4">
        <section>
          <Card>
            <h2 className="text-2xl lg:text-4xl font-bold tracking-tight">Articles</h2>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">
              Insights on AI inference benchmarking, GPU performance, and ML infrastructure.
            </p>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                <Link
                  href="/blog"
                  className={`rounded-full px-3 py-0.5 text-xs transition-colors ${
                    !activeTag
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  All
                </Link>
                {allTags.map((tag) => (
                  <BlogTagLink key={tag} tag={tag} active={activeTag === tag} />
                ))}
              </div>
            )}
          </Card>
          <Card>
            {filtered.length === 0 ? (
              <p className="text-muted-foreground">
                {activeTag ? `No articles tagged "${activeTag}".` : 'Coming soon.'}
              </p>
            ) : (
              <div className="flex flex-col gap-8 mx-4 md:mx-8">
                {filtered.map((post) => (
                  <BlogPostCard key={post.slug} slug={post.slug} title={post.title}>
                    <article>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
                        <time dateTime={post.date}>
                          {new Date(post.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            timeZone: 'UTC',
                          })}
                        </time>
                        <span>&middot;</span>
                        <span>{post.readingTime} min read</span>
                      </div>
                      <h2 className="text-2xl font-semibold mb-2 group-hover:underline group-hover:text-brand">
                        {post.title}
                      </h2>
                      <p className="text-muted-foreground mb-3">{post.subtitle}</p>
                      {post.tags && post.tags.length > 0 && (
                        <div className="flex gap-2">
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
          </Card>
        </section>
      </div>
    </main>
  );
}
