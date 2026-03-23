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
      className="group block rounded-lg border border-border p-6 transition-colors hover:bg-muted/50"
      onClick={() => track('blog_post_clicked', { slug, title })}
    >
      {children}
    </Link>
  );
}
