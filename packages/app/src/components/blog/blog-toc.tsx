'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Eyebrow } from '@/components/ui/eyebrow';
import { track } from '@/lib/analytics/analytics';
import type { TocHeading } from '@/lib/blog/blog';
import type { Locale } from '@/lib/i18n/i18n';
import { cn } from '@/lib/shared/utils';

const STRINGS = {
  en: {
    defaultLabel: 'On this page',
    tableOfContents: 'Table of contents',
  },
  zh: {
    defaultLabel: '本页目录',
    tableOfContents: '本页目录',
  },
} as const;

const ACTIVE_OFFSET_PX = 120;
const SCROLL_OFFSET_PX = 88;

interface BlogTocProps {
  headings: TocHeading[];
  label?: string;
  locale?: Locale;
  variant?: 'inline' | 'sidebar' | 'both';
  className?: string;
  sidebarListClassName?: string;
}

function handleClick(heading: TocHeading) {
  track('blog_toc_clicked', { heading: heading.text });
  const el = document.querySelector<HTMLElement>(`#${CSS.escape(heading.id)}`);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET_PX;
  window.scrollTo({ top, behavior: 'smooth' });
}

function useActiveHeading(headings: TocHeading[]): string {
  const [activeId, setActiveId] = useState('');
  const rafRef = useRef(0);

  useEffect(() => {
    if (headings.length === 0) return;
    const elements = headings
      .map((h) => document.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    function update() {
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 50;
      if (atBottom) {
        setActiveId(elements.at(-1)!.id);
        return;
      }
      let current = '';
      for (const el of elements) {
        if (el.getBoundingClientRect().top <= ACTIVE_OFFSET_PX) current = el.id;
        else break;
      }
      setActiveId(current);
    }

    function onScroll() {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [headings]);

  return activeId;
}

export function BlogToc({
  headings,
  label,
  locale = 'en',
  variant = 'both',
  className,
  sidebarListClassName,
}: BlogTocProps) {
  const t = STRINGS[locale];
  const displayLabel = label ?? t.defaultLabel;
  const activeId = useActiveHeading(headings);
  const activeItemRef = useRef<HTMLLIElement | null>(null);
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const box = scrollBoxRef.current;
    const item = activeItemRef.current;
    if (!box) return;
    if (!item) {
      box.scrollTop = 0;
      return;
    }
    const top = item.offsetTop;
    const bottom = top + item.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [activeId]);

  if (headings.length === 0) return null;

  const list = (
    <ol className="flex flex-col border-l border-border/30">
      {headings.map((h) => {
        const active = activeId === h.id;
        return (
          <li key={h.id} ref={active ? activeItemRef : undefined} className="-ml-px">
            <button
              type="button"
              aria-current={active ? 'location' : undefined}
              className={cn(
                'block w-full border-l-2 py-1 text-left text-sm leading-snug transition-colors',
                h.level === 3 ? 'pl-6' : 'pl-3',
                active
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
              onClick={() => handleClick(h)}
            >
              {h.text}
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      {variant !== 'sidebar' && (
        <details
          aria-label={t.tableOfContents}
          className={cn(
            'group rounded-xl border border-border/30 bg-card px-4 py-3',
            variant === 'both' && 'lg:hidden',
            className,
          )}
          data-testid="blog-toc-inline"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            {displayLabel}
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="mt-3">{list}</div>
        </details>
      )}

      {variant !== 'inline' && (
        <nav
          aria-label={t.tableOfContents}
          className={cn(
            'flex-col gap-3',
            variant === 'both' ? 'hidden lg:flex' : 'flex',
            className,
          )}
          data-testid="blog-toc-sidebar"
        >
          <Eyebrow as="p">{displayLabel}</Eyebrow>
          <div
            ref={scrollBoxRef}
            className={cn(
              'relative max-h-[calc(100vh-30rem)] overflow-y-auto pr-1 [scrollbar-width:thin]',
              sidebarListClassName,
            )}
          >
            {list}
          </div>
        </nav>
      )}
    </>
  );
}
