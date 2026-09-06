'use client';

import { useEffect, useRef, useState } from 'react';

import { Eyebrow } from '@/components/ui/eyebrow';
import { track } from '@/lib/analytics';
import type { TocHeading } from '@/lib/blog';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const STRINGS = {
  en: {
    defaultLabel: 'On this page',
    tableOfContents: 'Table of contents',
    clickToExpand: '(click to expand)',
  },
  zh: {
    defaultLabel: '本页目录',
    tableOfContents: '本页目录',
    clickToExpand: '（点击展开）',
  },
} as const;

/** Offset from the viewport top at which a heading counts as "current". */
const ACTIVE_OFFSET_PX = 120;
/** Scroll target offset so the heading clears the fixed navbar. */
const SCROLL_OFFSET_PX = 88;

interface BlogTocProps {
  headings: TocHeading[];
  /** Heading label, e.g. '本页目录' on Chinese pages. */
  label?: string;
  locale?: Locale;
  /**
   * `inline` renders a collapsible list for narrow layouts, `sidebar` the
   * always-open list for the sticky column. `both` renders each and lets CSS
   * pick (inline below `lg`, sidebar from `lg`).
   */
  variant?: 'inline' | 'sidebar' | 'both';
  className?: string;
}

function handleClick(heading: TocHeading) {
  track('blog_toc_clicked', { heading: heading.text });
  const el = document.querySelector<HTMLElement>(`#${CSS.escape(heading.id)}`);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET_PX;
  window.scrollTo({ top, behavior: 'smooth' });
}

/** Tracks which heading is current: the last one whose top has passed the offset line. */
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
}: BlogTocProps) {
  const t = STRINGS[locale];
  const displayLabel = label ?? t.defaultLabel;
  const activeId = useActiveHeading(headings);
  const activeItemRef = useRef<HTMLLIElement | null>(null);
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);

  // Keep the active item visible inside the sidebar's own scroll box without
  // touching the window scroll position.
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
    <ol className="flex flex-col border-l border-border/40">
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
            'group rounded-xl border border-border/50 bg-card/60 px-4 py-3 backdrop-blur-[2px]',
            variant === 'both' && 'lg:hidden',
            className,
          )}
          data-testid="blog-toc-inline"
        >
          <summary className="cursor-pointer text-sm font-medium">
            {displayLabel}{' '}
            <span className="font-normal text-muted-foreground group-open:hidden">
              {t.clickToExpand}
            </span>
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
          <Eyebrow as="p" tone="muted">
            {displayLabel}
          </Eyebrow>
          <div
            ref={scrollBoxRef}
            className="relative max-h-[calc(100vh-30rem)] overflow-y-auto pr-1 [scrollbar-width:thin]"
          >
            {list}
          </div>
        </nav>
      )}
    </>
  );
}
