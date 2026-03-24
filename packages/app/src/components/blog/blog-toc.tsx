'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import type { TocHeading } from '@/lib/blog';

interface BlogTocProps {
  headings: TocHeading[];
}

export function BlogToc({ headings }: BlogTocProps) {
  const [activeId, setActiveId] = useState('');
  const [sidebarLeft, setSidebarLeft] = useState<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  const updatePosition = useCallback(() => {
    const section = sectionRef.current ?? document.querySelector('[data-blog-section]');
    if (!section) return;
    sectionRef.current = section as HTMLElement;
    const rect = section.getBoundingClientRect();
    const rightEdge = rect.right;
    const viewportWidth = window.innerWidth;
    // Only show sidebar if there's at least 240px to the right of the content
    if (viewportWidth - rightEdge >= 240) {
      setSidebarLeft(rightEdge + 32);
    } else {
      setSidebarLeft(null);
    }
  }, []);

  useEffect(() => {
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [updatePosition]);

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
      {/* Inline: when sidebar doesn't fit */}
      {sidebarLeft === null && (
        <Card>
          <details className="lg:hidden" aria-label="Table of contents">
            <summary className="text-sm font-medium cursor-pointer">On this page</summary>
            <div className="mt-2">{list}</div>
          </details>
          <nav className="hidden lg:block" aria-label="Table of contents">
            <p className="text-sm font-medium mb-2">On this page</p>
            {list}
          </nav>
        </Card>
      )}

      {/* Fixed sidebar: when enough space exists to the right */}
      {sidebarLeft !== null && (
        <nav
          className="fixed top-8 w-52 max-h-[calc(100vh-4rem)] overflow-y-auto"
          style={{ left: sidebarLeft }}
          aria-label="Table of contents"
        >
          <p className="text-sm font-medium mb-2">On this page</p>
          {list}
        </nav>
      )}
    </>
  );
}
