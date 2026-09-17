'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';

import { tagChipClass } from './blog-tag-chip';

interface BlogTagLinkProps {
  tag: string;
  active?: boolean;
  /** Blog list base path, e.g. '/zh/blog' on Chinese pages. */
  basePath?: string;
  /** Optional post count shown after the tag name. */
  count?: number;
  /** When set, the chip links to the unfiltered index (the "All" chip). */
  clear?: boolean;
  children?: React.ReactNode;
}

/**
 * Tag filter chip. Filtering is a plain `?tag=` query on the index route, so
 * every state is a real URL that can be shared and crawled.
 */
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
