import { ChevronDown } from 'lucide-react';

import { TAG_CHIP_CLASS } from './blog-tag-chip';
import { BlogTagLink } from './blog-tag-link';

interface BlogTagFilterProps {
  /** Tags shown inline, most frequent first. */
  primary: string[];
  /** Everything else, alphabetical, behind the disclosure. */
  more: string[];
  activeTag?: string;
  basePath: string;
  labels: { all: string; more: string; filter: string };
}

/**
 * One-row tag filter: "All", the most frequent tags, and a disclosure for the
 * long tail. The active tag is always visible even when it lives in the tail.
 */
export function BlogTagFilter({ primary, more, activeTag, basePath, labels }: BlogTagFilterProps) {
  const inline = activeTag && more.includes(activeTag) ? [...primary, activeTag] : primary;
  const tail = more.filter((tag) => tag !== activeTag);
  return (
    <nav
      className="relative flex flex-wrap items-center gap-2"
      aria-label={labels.filter}
      data-testid="blog-tag-filter"
    >
      <BlogTagLink tag="" clear active={!activeTag} basePath={basePath}>
        {labels.all}
      </BlogTagLink>
      {inline.map((tag) => (
        <BlogTagLink key={tag} tag={tag} active={activeTag === tag} basePath={basePath} />
      ))}
      {tail.length > 0 && (
        <details className="group">
          <summary
            className={`${TAG_CHIP_CLASS} cursor-pointer list-none border-dashed border-border/60 text-muted-foreground hover:border-border hover:text-foreground [&::-webkit-details-marker]:hidden`}
          >
            {labels.more}
            <span className="text-muted-foreground/80 tabular-nums" aria-hidden="true">
              {tail.length}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-3.5 transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="absolute inset-x-0 top-full z-20 mt-2 flex flex-wrap gap-2 rounded-xl border border-border/50 bg-card p-4 shadow-xl shadow-black/20">
            {tail.map((tag) => (
              <BlogTagLink key={tag} tag={tag} basePath={basePath} />
            ))}
          </div>
        </details>
      )}
    </nav>
  );
}
