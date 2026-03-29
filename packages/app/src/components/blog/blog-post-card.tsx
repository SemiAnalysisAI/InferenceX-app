'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { track } from '@/lib/analytics';

interface BlogPostCardProps {
  slug: string;
  title: string;
  children: ReactNode;
}

export function BlogPostCard({ slug, title, children }: BlogPostCardProps) {
  return (
    <Link
      href={`/blog/${slug}`}
      className="group relative block rounded-xl border border-border bg-background/20 backdrop-blur-[2px] p-4 md:p-8 transition-all duration-200 hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5 hover:scale-[1.01]"
      onClick={() => track('blog_post_clicked', { slug, title })}
    >
      <div className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand/60 transition-all duration-200 group-hover:bg-brand group-hover:inset-y-2" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">{children}</div>
        <ArrowRight className="h-5 w-5 shrink-0 mt-1 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
    </Link>
  );
}
