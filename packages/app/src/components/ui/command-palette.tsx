'use client';

import {
  CornerDownLeftIcon,
  ExternalLinkIcon,
  LanguagesIcon,
  SearchIcon,
  SunMoonIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import * as React from 'react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { track } from '@/lib/analytics';
import {
  buildPaletteNavItems,
  PALETTE_GROUP_LABELS,
  type PaletteGroupKey,
  type PaletteNavItem,
} from '@/lib/command-palette-items';
import { hasZhSibling, switchLocalePath, zhPath } from '@/lib/i18n';
import { pushInApp } from '@/lib/client-navigation';
import { useClientPathname } from '@/hooks/useClientPathname';
import { useClientSearch } from '@/hooks/useClientSearch';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import { matchesSearch } from '@/lib/search-match';

const STRINGS = {
  en: {
    triggerLabel: 'Search and navigate',
    triggerText: 'Search',
    dialogTitle: 'Search and navigate',
    placeholder: 'Search pages, models, chips…',
    noResults: 'No results for',
    noResultsHint: 'Try a model, chip, or page name — e.g. “kimi k3” or “b300”.',
    actions: 'Actions',
    switchTheme: 'Switch theme',
    switchThemeKeywords: 'dark light mode color 主题 深色 浅色',
    switchLocale: '切换到中文版',
    switchLocaleKeywords: 'chinese language locale 中文 语言',
    github: 'Star on GitHub',
    githubKeywords: 'repository source code star 开源 仓库',
    navigate: 'navigate',
    open: 'open',
    close: 'close',
  },
  zh: {
    triggerLabel: '搜索与导航',
    triggerText: '搜索',
    dialogTitle: '搜索与导航',
    placeholder: '搜索页面、模型、芯片…',
    noResults: '没有匹配结果：',
    noResultsHint: '试试模型、芯片或页面名称，例如 “kimi k3” 或 “b300”。',
    actions: '操作',
    switchTheme: '切换主题',
    switchThemeKeywords: 'switch theme dark light mode 深色 浅色',
    switchLocale: 'Switch to English',
    switchLocaleKeywords: 'english language locale 英文 语言',
    github: '在 GitHub 上加星',
    githubKeywords: 'github repository source code star 开源 仓库',
    navigate: '导航',
    open: '打开',
    close: '关闭',
  },
} as const;

const GITHUB_URL = 'https://github.com/SemiAnalysisAI/InferenceX';

const THEME_CYCLE = ['light', 'dark', 'minecraft'] as const;

interface ActionItem {
  id: string;
  label: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

interface FlatEntry {
  key: string;
  label: string;
  /** Right-aligned secondary text (nav destination path). */
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  select: () => void;
}

interface Section {
  label: string;
  entries: FlatEntry[];
}

/**
 * Global command palette: ⌘K / Ctrl+K (or the header search button) opens a
 * dialog that jumps to any page, dashboard tab, model, or chip page, plus a
 * few actions. Filtering shares `matchesSearch` with every other search box,
 * so punctuation and word order never matter.
 */
export function CommandPalette() {
  const router = useRouter();
  const routerPathname = usePathname() ?? '/';
  // Live pathname: per-model dashboard routes rewrite the URL outside the
  // Next router, which usePathname alone would miss (same as LanguageToggle).
  const pathname = useClientPathname(routerPathname);
  const search = useClientSearch();
  const locale = useLocale();
  const t = STRINGS[locale];
  const { setTheme, theme } = useTheme();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isMac, setIsMac] = React.useState<boolean | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();

  React.useEffect(() => {
    setIsMac(/mac|iphone|ipad|ipod/i.test(navigator.platform));
  }, []);

  const openPalette = React.useCallback((source: 'shortcut' | 'button') => {
    setOpen(true);
    track('command_palette_opened', { source });
  }, []);

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, []);

  // Mirror of `open` for the document-level shortcut listener, so toggling
  // goes through handleOpenChange (which resets the query on close).
  const openRef = React.useRef(false);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  // Global ⌘K / Ctrl+K shortcut. Toggles, so a second press closes.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
        event.preventDefault();
        if (openRef.current) {
          handleOpenChange(false);
        } else {
          handleOpenChange(true);
          track('command_palette_opened', { source: 'shortcut' });
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleOpenChange]);

  const navItems = React.useMemo(() => buildPaletteNavItems(locale), [locale]);

  // Dashboard tab jumps carry the unofficialruns param, same as TabNav.
  const unofficialIds = React.useMemo(() => {
    for (const [key, value] of new URLSearchParams(search)) {
      if (/^unofficialruns?$/iu.test(key) && value) return value;
    }
    return '';
  }, [search]);

  const selectNav = React.useCallback(
    (item: PaletteNavItem) => {
      const target = locale === 'zh' && hasZhSibling(item.href) ? zhPath(item.href) : item.href;
      track('command_palette_selected', { id: item.id, query });
      handleOpenChange(false);
      // Selecting the current page is a no-op — a refetch would only wipe the
      // dashboard filters (header links behave the same way).
      if (target === pathname) return;
      const href =
        item.group === 'dashboard' && unofficialIds
          ? `${target}?unofficialruns=${unofficialIds}`
          : target;
      pushInApp(router, href);
    },
    [locale, query, router, handleOpenChange, pathname, unofficialIds],
  );

  const actionItems = React.useMemo<ActionItem[]>(
    () => [
      {
        id: 'action:theme',
        label: t.switchTheme,
        keywords: t.switchThemeKeywords,
        icon: SunMoonIcon,
        run: () => {
          const idx = THEME_CYCLE.indexOf(theme as (typeof THEME_CYCLE)[number]);
          const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
          setTheme(next);
          track('theme_toggled', { theme: next });
        },
      },
      {
        id: 'action:locale',
        label: t.switchLocale,
        keywords: t.switchLocaleKeywords,
        icon: LanguagesIcon,
        run: () => {
          // Same contract as the header language toggle: keep the current
          // query string (dashboard filters) and use the commit-retry push.
          pushInApp(router, switchLocalePath(pathname) + search);
        },
      },
      {
        id: 'action:github',
        label: t.github,
        keywords: t.githubKeywords,
        icon: ExternalLinkIcon,
        run: () => {
          window.open(GITHUB_URL, '_blank', 'noopener,noreferrer');
        },
      },
    ],
    [t, theme, setTheme, router, pathname, search],
  );

  const sections = React.useMemo<Section[]>(() => {
    const navSections = (Object.keys(PALETTE_GROUP_LABELS) as PaletteGroupKey[]).map((group) => ({
      label: PALETTE_GROUP_LABELS[group][locale],
      entries: navItems
        .filter((item) => item.group === group && matchesSearch(query, item.label, item.keywords))
        .map<FlatEntry>((item) => ({
          key: item.id,
          label: item.label,
          hint: item.href,
          select: () => selectNav(item),
        })),
    }));
    const actions: Section = {
      label: t.actions,
      entries: actionItems
        .filter((action) => matchesSearch(query, action.label, action.keywords))
        .map<FlatEntry>((action) => ({
          key: action.id,
          label: action.label,
          icon: action.icon,
          select: () => {
            track('command_palette_selected', { id: action.id, query });
            handleOpenChange(false);
            action.run();
          },
        })),
    };
    return [...navSections, actions].filter((section) => section.entries.length > 0);
  }, [navItems, actionItems, query, locale, t, selectNav, handleOpenChange]);

  const flatEntries = React.useMemo(() => sections.flatMap((s) => s.entries), [sections]);

  // Clamp/reset the active row whenever the result set changes.
  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);
  const clampedIndex = Math.min(activeIndex, Math.max(0, flatEntries.length - 1));

  const scrollRowIntoView = (index: number) => {
    const row = listRef.current?.querySelector(`[data-palette-index="${index}"]`);
    // scrollIntoView is missing from some DOM test environments.
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  };

  const moveActive = (delta: number) => {
    if (flatEntries.length === 0) return;
    const next = (clampedIndex + delta + flatEntries.length) % flatEntries.length;
    setActiveIndex(next);
    scrollRowIntoView(next);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Home' && flatEntries.length > 0) {
      event.preventDefault();
      setActiveIndex(0);
      scrollRowIntoView(0);
    } else if (event.key === 'End' && flatEntries.length > 0) {
      event.preventDefault();
      setActiveIndex(flatEntries.length - 1);
      scrollRowIntoView(flatEntries.length - 1);
    } else if (event.key === 'Enter') {
      // Ignore the Enter that confirms an IME composition (CJK input),
      // otherwise committing Chinese text would also run the selection.
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      flatEntries[clampedIndex]?.select();
    }
  };

  let rowIndex = -1;

  return (
    <>
      <button
        type="button"
        data-testid="command-palette-trigger"
        aria-label={t.triggerLabel}
        onClick={() => openPalette('button')}
        className={cn(
          'inline-flex items-center gap-2 rounded-md border border-border/60 min-h-9 px-2.5',
          'text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <SearchIcon className="size-4" aria-hidden="true" />
        <span className="hidden lg:inline">{t.triggerText}</span>
        {isMac !== null && (
          <kbd
            aria-hidden="true"
            className="hidden sm:inline-flex items-center whitespace-nowrap rounded border border-border/60 bg-muted px-1.5 font-mono text-[11px] text-muted-foreground"
          >
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        )}
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          data-testid="command-palette"
          className="top-[15%] translate-y-0 w-[calc(100%-2rem)] sm:w-full max-w-xl gap-0 p-0 overflow-hidden"
        >
          <DialogTitle className="sr-only">{t.dialogTitle}</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border/60 px-3 pr-12">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={
                flatEntries.length > 0 ? `${listboxId}-opt-${clampedIndex}` : undefined
              }
              aria-label={t.placeholder}
              data-testid="command-palette-input"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder={t.placeholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={t.dialogTitle}
            className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2"
          >
            {flatEntries.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                <p>
                  {t.noResults} <span className="text-foreground">“{query}”</span>
                </p>
                <p className="mt-1">{t.noResultsHint}</p>
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.label} role="group" aria-label={section.label}>
                  <div className="px-3 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {section.label}
                  </div>
                  {section.entries.map((entry) => {
                    rowIndex += 1;
                    const index = rowIndex;
                    const isActive = index === clampedIndex;
                    const Icon = entry.icon;
                    return (
                      <div
                        key={entry.key}
                        id={`${listboxId}-opt-${index}`}
                        data-palette-index={index}
                        role="option"
                        aria-selected={isActive}
                        className={cn(
                          'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm',
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground hover:bg-muted',
                        )}
                        onMouseMove={() => setActiveIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={entry.select}
                      >
                        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
                        <span className="truncate">{entry.label}</span>
                        {entry.hint && (
                          <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                            {entry.hint}
                          </span>
                        )}
                        {isActive && !entry.hint && (
                          <CornerDownLeftIcon
                            className="ml-auto size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <span>
              <kbd className="rounded border border-border/60 bg-muted px-1 font-mono">↑↓</kbd>{' '}
              {t.navigate}
            </span>
            <span>
              <kbd className="rounded border border-border/60 bg-muted px-1 font-mono">↵</kbd>{' '}
              {t.open}
            </span>
            <span>
              <kbd className="rounded border border-border/60 bg-muted px-1 font-mono">esc</kbd>{' '}
              {t.close}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
