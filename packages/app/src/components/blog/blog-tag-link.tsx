'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics/analytics';

import { tagChipClass } from './blog-tag-chip';

interface BlogTagLinkProps {
  tag: string;
  active?: boolean;
  basePath?: string;
  count?: number;
  clear?: boolean;
  children?: React.ReactNode;
}

export function BlogTagLink({
  tag,
  active,
  basePath = '/blog',
  count,
  clear = false,
  children,
}: BlogTagLinkProps) {
  return (
    <Link
      href={clear ? basePath : `${basePath}?tag=${encodeURIComponent(tag)}`}
      className={tagChipClass(active)}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        track('blog_tag_filtered', { tag: clear ? 'all' : tag });
      }}
    >
      {children ?? tag}
      {count !== undefined && (
        <span className="text-muted-foreground/80 tabular-nums" aria-hidden="true">
          {count}
        </span>
      )}
    </Link>
  );
}
