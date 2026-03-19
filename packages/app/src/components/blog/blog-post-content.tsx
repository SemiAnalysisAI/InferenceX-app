'use client';

import Link from 'next/link';
import Markdown from 'react-markdown';
import { track } from '@/lib/analytics';

import { Card } from '@/components/ui/card';

import type { BlogPost } from './blog-data';

export function BlogPostContent({ post }: { post: BlogPost }) {
  const formattedDate = new Date(post.date + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="relative min-h-screen">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-16 lg:gap-4">
        <section>
          <Card>
            <Link
              href="/blog"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
              onClick={() => track('blog_back_clicked')}
            >
              &larr; Back to Blog
            </Link>
            <h2 className="mt-4 text-2xl lg:text-4xl font-bold tracking-tight">{post.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{formattedDate}</span>
              <span>&middot;</span>
              <span className="font-semibold text-foreground">{post.author}</span>
              {post.tags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Card>
          <Card>
            <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg">
              <Markdown>{post.content}</Markdown>
            </article>
          </Card>
        </section>
      </div>
    </main>
  );
}
