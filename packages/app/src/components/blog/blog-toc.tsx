'use client';

import { track } from '@/lib/analytics';
import type { TocHeading } from '@/lib/blog';

interface BlogTocProps {
  headings: TocHeading[];
}

export function BlogToc({ headings }: BlogTocProps) {
  if (headings.length === 0) return null;

  function handleClick(heading: TocHeading) {
    track('blog_toc_clicked', { heading: heading.text });
    const el = document.getElementById(heading.id);
    el?.scrollIntoView({ behavior: 'smooth' });
  }

  const list = (
    <ul className="flex flex-col gap-1.5 text-sm">
      {headings.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            className={`text-left text-muted-foreground hover:text-foreground transition-colors ${h.level === 3 ? 'pl-4' : ''}`}
            onClick={() => handleClick(h)}
          >
            {h.text}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <nav className="hidden lg:block" aria-label="Table of contents">
        <p className="text-sm font-medium mb-2">On this page</p>
        {list}
      </nav>
      <details className="lg:hidden" aria-label="Table of contents">
        <summary className="text-sm font-medium cursor-pointer">On this page</summary>
        <div className="mt-2">{list}</div>
      </details>
    </>
  );
}
