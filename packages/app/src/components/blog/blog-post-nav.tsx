'use client';

import { PagerCard } from '@/components/ui/pager-card';
import { track } from '@/lib/analytics/analytics';

interface PostLink {
  slug: string;
  title: string;
}

interface BlogPostNavProps {
  prev: PostLink | null;
  next: PostLink | null;
  basePath?: string;
  labels?: { prev: string; next: string };
}

export function BlogPostNav({
  prev,
  next,
  basePath = '/blog',
  labels = { prev: 'Previous', next: 'Next' },
}: BlogPostNavProps) {
  if (!prev && !next) return null;

  return (
    <nav className="grid max-w-measure gap-4 sm:grid-cols-2" data-testid="blog-post-nav">
      {prev ? (
        <PagerCard
          testId="blog-nav-prev"
          href={`${basePath}/${prev.slug}`}
          direction="prev"
          label={labels.prev}
          title={prev.title}
          onClick={() => track('blog_nav_prev', { slug: prev.slug, title: prev.title })}
        />
      ) : (
        <div aria-hidden="true" className="hidden sm:block" />
      )}
      {next ? (
        <PagerCard
          testId="blog-nav-next"
          href={`${basePath}/${next.slug}`}
          direction="next"
          label={labels.next}
          title={next.title}
          onClick={() => track('blog_nav_next', { slug: next.slug, title: next.title })}
        />
      ) : (
        <div aria-hidden="true" className="hidden sm:block" />
      )}
    </nav>
  );
}
