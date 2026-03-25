'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { track } from '@/lib/analytics';
import type { TocHeading } from '@/lib/blog';

interface BlogTocProps {
  headings: TocHeading[];
}

export function BlogToc({ headings }: BlogTocProps) {
  const [activeId, setActiveId] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sectionTopRef = useRef(0);
  const sidebarLeftRef = useRef(0);

  const updateLayout = useCallback(() => {
    const section = sectionRef.current ?? document.querySelector('[data-blog-section]');
    if (!section) return;
    sectionRef.current = section as HTMLElement;
    const rect = section.getBoundingClientRect();
    const rightEdge = rect.right;
    sectionTopRef.current = rect.top + window.scrollY;
    sidebarLeftRef.current = rightEdge + 32;
    const fits = window.innerWidth - rightEdge >= 240;
    setShowSidebar(fits);
    if (fits && sidebarRef.current) {
      sidebarRef.current.style.left = `${rightEdge + 32}px`;
      const top = Math.max(32, sectionTopRef.current - window.scrollY);
      sidebarRef.current.style.top = `${top}px`;
    }
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(updateLayout);
    window.addEventListener('resize', updateLayout);

    function onScroll() {
      if (!sidebarRef.current) return;
      const top = Math.max(32, sectionTopRef.current - window.scrollY);
      sidebarRef.current.style.top = `${top}px`;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', onScroll);
    };
  }, [updateLayout]);

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

    function onScrollEnd() {
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
      if (atBottom && headings.length > 0) {
        setActiveId(headings[headings.length - 1].id);
      }
    }

    window.addEventListener('scroll', onScrollEnd, { passive: true });
    return () => {
      observerRef.current?.disconnect();
      window.removeEventListener('scroll', onScrollEnd);
    };
  }, [headings]);

  const activeIndex = useMemo(
    () => headings.findIndex((h) => h.id === activeId),
    [headings, activeId],
  );

  // Auto-scroll the sidebar TOC to keep the active item visible
  const activeItemRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!showSidebar || !activeItemRef.current) return;
    activeItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId, showSidebar]);

  if (headings.length === 0) return null;

  function handleClick(heading: TocHeading) {
    track('blog_toc_clicked', { heading: heading.text });
    const el = document.getElementById(heading.id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 32;
    window.scrollTo({ top, behavior: 'smooth' });
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
        <li key={h.id} ref={h.id === activeId ? activeItemRef : undefined}>
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
      {!showSidebar && (
        <details aria-label="Table of contents">
          <summary className="text-sm font-medium cursor-pointer">
            On this page{' '}
            <span className="text-muted-foreground font-normal">(click to expand)</span>
          </summary>
          <div className="mt-2">{list}</div>
        </details>
      )}

      {/* Sidebar */}
      {showSidebar &&
        createPortal(
          <nav
            ref={sidebarRef}
            className="fixed w-52 pt-12 max-h-[calc(100vh-4rem)] overflow-y-auto"
            style={{
              left: sidebarLeftRef.current,
              top: Math.max(32, sectionTopRef.current - window.scrollY),
            }}
            aria-label="Table of contents"
          >
            <p className="text-sm font-medium mb-2">On this page</p>
            {list}
          </nav>,
          document.body,
        )}
    </>
  );
}
