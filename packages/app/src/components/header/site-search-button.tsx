'use client';

import { Suspense, lazy, useCallback, useEffect, useState } from 'react';

import { HEADER_ACTION_STYLE } from '@/components/ui/control-styles';
import { track } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { cn } from '@/lib/shared/utils';

const loadDialog = () => import('./site-search-dialog');
const SiteSearchDialog = lazy(() =>
  loadDialog().then((module) => ({ default: module.SiteSearchDialog })),
);

const STRINGS = {
  en: { label: 'Search InferenceX' },
  zh: { label: '搜索 InferenceX' },
} as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/u.test(target.tagName);
}

export function SiteSearchButton() {
  const locale = useLocale();
  const strings = STRINGS[locale];
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const openSearch = useCallback((method: 'click' | 'shortcut') => {
    setMounted(true);
    setOpen(true);
    track('header_search_opened', { method });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isModK = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      const isSlash =
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target);
      if (!isModK && !isSlash) return;
      event.preventDefault();
      openSearch('shortcut');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openSearch]);

  return (
    <>
      <button
        type="button"
        data-testid="site-search-toggle"
        aria-label={strings.label}
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K /"
        title={strings.label}
        className={cn(HEADER_ACTION_STYLE, 'size-11')}
        onClick={() => openSearch('click')}
        onPointerEnter={() => void loadDialog()}
        onFocus={() => void loadDialog()}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.8-3.8" />
        </svg>
      </button>
      {mounted && (
        <Suspense fallback={null}>
          <SiteSearchDialog open={open} onOpenChange={setOpen} locale={locale} />
        </Suspense>
      )}
    </>
  );
}
