'use client';

import Link from 'next/link';
import { track } from '@/lib/analytics';

import { Card } from '@/components/ui/card';

import { BLOG_POSTS } from './blog-data';

function BlogPostCard({
  slug,
  title,
  author,
  date,
  excerpt,
  tags,
}: {
  slug: string;
  title: string;
  author: string;
  date: string;
  excerpt: string;
  tags?: string[];
}) {
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Link
      href={`/blog/${slug}`}
      className="group block"
      onClick={() => track('blog_post_clicked', { slug })}
    >
      <Card className="p-3 sm:p-5 lg:p-6 transition-colors hover:bg-card">
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{formattedDate}</span>
            <span>&middot;</span>
            <span className="font-semibold text-foreground">{author}</span>
            {tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
          <h3 className="text-sm sm:text-base lg:text-lg font-medium leading-snug text-foreground group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2">{excerpt}</p>
        </div>
      </Card>
    </Link>
  );
}

export function BlogContent() {
  const sorted = [...BLOG_POSTS].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main className="relative min-h-screen">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-16 lg:gap-4">
        <section>
          <Card>
            <h2 className="text-2xl lg:text-4xl font-bold tracking-tight">
              InferenceX&trade; Blog
            </h2>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">
              Deep dives into inference benchmarking, GPU performance, and the economics of AI
              compute.
            </p>
          </Card>
          {sorted.length > 0 ? (
            <Card>
              <div className="flex flex-col gap-3 md:pl-6">
                {sorted.map((post) => (
                  <BlogPostCard key={post.slug} {...post} />
                ))}
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-muted-foreground text-center py-8">
                Blog posts coming soon. Stay tuned!
              </p>
            </Card>
          )}
        </section>
      </div>
    </main>
  );
}
