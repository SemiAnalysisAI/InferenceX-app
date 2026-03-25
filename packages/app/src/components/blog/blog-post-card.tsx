'use client';

import Link from 'next/link';
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
      className="group block rounded-xl border border-border/40 bg-background/20 backdrop-blur-[2px] p-4 md:p-8 transition-colors hover:bg-muted/50"
      onClick={() => track('blog_post_clicked', { slug, title })}
    >
      {children}
    </Link>
  );
}
