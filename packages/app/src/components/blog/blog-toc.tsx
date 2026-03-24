'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import type { TocHeading } from '@/lib/blog';

interface BlogTocProps {
  headings: TocHeading[];
}

export function BlogToc({ headings }: BlogTocProps) {
  const [activeId, setActiveId] = useState('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter(Boolean) as HTMLElement[];

    if (elements.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '0px 0px -80% 0px', threshold: 0 },
    );

    for (const el of elements) {
      observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [headings]);

  const activeIndex = useMemo(
    () => headings.findIndex((h) => h.id === activeId),
    [headings, activeId],
  );

  if (headings.length === 0) return null;

  function handleClick(heading: TocHeading) {
    track('blog_toc_clicked', { heading: heading.text });
    const el = document.getElementById(heading.id);
    el?.scrollIntoView({ behavior: 'smooth' });
  }

  function itemClass(h: TocHeading, index: number): string {
    const indent = h.level === 2 ? 'pl-3' : h.level === 3 ? 'pl-6' : '';
    if (activeId === h.id) return `${indent} text-brand font-medium`;
    if (activeIndex >= 0 && index < activeIndex) return `${indent} text-muted-foreground/50`;
    return `${indent} text-muted-foreground hover:text-foreground`;
  }

  const list = (
    <ul className="flex flex-col gap-1.5 text-sm">
      {headings.map((h, i) => (
        <li key={h.id}>
          <button
            type="button"
            className={`text-left transition-colors ${itemClass(h, i)}`}
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
      {/* Inline: screens below 2xl */}
      <Card className="2xl:hidden">
        <details className="lg:hidden" aria-label="Table of contents">
          <summary className="text-sm font-medium cursor-pointer">On this page</summary>
          <div className="mt-2">{list}</div>
        </details>
        <nav className="hidden lg:block" aria-label="Table of contents">
          <p className="text-sm font-medium mb-2">On this page</p>
          {list}
        </nav>
      </Card>

      {/* Sticky sidebar: ultrawide screens — container spans full section height */}
      <div className="hidden 2xl:block absolute top-0 bottom-0 left-full pl-8">
        <nav
          className="sticky top-8 w-56 max-h-[calc(100vh-4rem)] overflow-y-auto"
          aria-label="Table of contents"
        >
          <p className="text-sm font-medium mb-2">On this page</p>
          {list}
        </nav>
      </div>
    </>
  );
}
