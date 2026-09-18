'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Eyebrow } from '@/components/ui/eyebrow';
import { headingVariants } from '@/components/ui/heading';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface PostLink {
  slug: string;
  title: string;
}

interface BlogPostNavProps {
  prev: PostLink | null;
  next: PostLink | null;
  /** Blog list base path, e.g. '/zh/blog' on Chinese pages. */
  basePath?: string;
  labels?: { prev: string; next: string };
}

function NavCard({
  href,
  direction,
  label,
  title,
  onClick,
}: {
  href: string;
  direction: 'prev' | 'next';
  label: string;
  title: string;
  onClick: () => void;
}) {
  const Icon = direction === 'prev' ? ArrowLeft : ArrowRight;
  return (
    <Link
      href={href}
      className={cn(
        'group flex min-w-0 flex-col gap-2 rounded-2xl border border-border/50 bg-card/60 p-5 backdrop-blur-[2px] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5',
        direction === 'next' && 'items-end text-right',
      )}
      data-testid={`blog-nav-${direction}`}
      onClick={onClick}
    >
      <Eyebrow
        as="span"
        tone="muted"
        className={cn(
          'inline-flex items-center gap-1.5',
          direction === 'next' && 'flex-row-reverse',
        )}
      >
        <Icon
          aria-hidden="true"
          className={cn(
            'size-3.5 transition-transform duration-200',
            direction === 'prev' ? 'group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5',
          )}
        />
        {label}
      </Eyebrow>
      <span
        className={cn(
          headingVariants({ level: 'card' }),
          'line-clamp-2 text-balance leading-snug group-hover:text-brand',
        )}
      >
        {title}
      </span>
    </Link>
  );
}

/** Previous / next article cards under the post body. Slot stays empty at either end of the list. */
export function BlogPostNav({
  prev,
  next,
  basePath = '/blog',
  labels = { prev: 'Previous', next: 'Next' },
}: BlogPostNavProps) {
  if (!prev && !next) return null;

  return (
    <nav className="grid gap-4 sm:grid-cols-2" data-testid="blog-post-nav">
      {prev ? (
        <NavCard
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
        <NavCard
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
