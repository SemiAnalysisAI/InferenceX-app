'use client';

import Link from 'next/link';
import { track } from '@/lib/analytics';

interface BlogTagLinkProps {
  tag: string;
  active?: boolean;
}

export function BlogTagLink({ tag, active }: BlogTagLinkProps) {
  return (
    <Link
      href={`/blog?tag=${encodeURIComponent(tag)}`}
      className={`rounded-full px-3 py-0.5 text-xs transition-colors ${
        active
          ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        track('blog_tag_filtered', { tag });
      }}
    >
      {tag}
    </Link>
  );
}
