'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { track } from '@/lib/analytics';

interface PostLink {
  slug: string;
  title: string;
}

interface BlogPostNavProps {
  prev: PostLink | null;
  next: PostLink | null;
}

export function BlogPostNav({ prev, next }: BlogPostNavProps) {
  if (!prev && !next) return null;

  return (
    <nav className="flex flex-col sm:flex-row justify-between gap-4 mt-2">
      {prev ? (
        <Link
          href={`/blog/${prev.slug}`}
          className="group relative flex items-center gap-3 rounded-xl border border-border bg-background/20 backdrop-blur-[2px] p-4 transition-all duration-200 hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5 hover:scale-[1.01] flex-1"
          onClick={() => track('blog_nav_prev', { slug: prev.slug, title: prev.title })}
        >
          <ChevronLeft className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Previous</p>
            <p className="text-sm font-medium truncate group-hover:underline">{prev.title}</p>
          </div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <Link
          href={`/blog/${next.slug}`}
          className="group relative flex items-center justify-end gap-3 rounded-xl border border-border bg-background/20 backdrop-blur-[2px] p-4 transition-all duration-200 hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5 hover:scale-[1.01] flex-1 text-right"
          onClick={() => track('blog_nav_next', { slug: next.slug, title: next.title })}
        >
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Next</p>
            <p className="text-sm font-medium truncate group-hover:underline">{next.title}</p>
          </div>
          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </nav>
  );
}
