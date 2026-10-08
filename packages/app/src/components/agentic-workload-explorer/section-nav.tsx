'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { explorerHref, explorerRelativePath } from '@/lib/agentic-workload-explorer/paths';
import { track } from '@/lib/analytics';
import type { Locale } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

export interface ExplorerNavLink {
  /** Explorer-relative path, e.g. `/sessions`. */
  path: string;
  label: { en: string; zh: string };
}

/** Primary sections, shown inline; the rest live in the "More" menu. */
export const PRIMARY_SECTIONS: readonly ExplorerNavLink[] = [
  { path: '/', label: { en: 'Overview', zh: '概览' } },
  { path: '/sessions', label: { en: 'Sessions', zh: '会话' } },
  { path: '/trends', label: { en: 'Trends', zh: '趋势' } },
  { path: '/latency', label: { en: 'Latency', zh: '延迟' } },
  { path: '/graphs', label: { en: 'Graphs', zh: '图表' } },
  { path: '/session-reuse', label: { en: 'Session Reuse', zh: '会话复用' } },
  { path: '/tool-analytics', label: { en: 'Tools', zh: '工具' } },
  { path: '/costs', label: { en: 'Costs', zh: '成本' } },
  { path: '/fast-mode', label: { en: 'Fast Mode', zh: 'Fast Mode' } },
];

export const MORE_SECTIONS: readonly ExplorerNavLink[] = [
  { path: '/models', label: { en: 'Models', zh: '模型' } },
  { path: '/traffic', label: { en: 'Traffic', zh: '流量' } },
  { path: '/session-insights', label: { en: 'Session Insights', zh: '会话洞察' } },
  { path: '/errors', label: { en: 'Errors', zh: '错误' } },
  { path: '/platform', label: { en: 'Platform', zh: '平台' } },
  { path: '/cache', label: { en: 'Cache', zh: '缓存' } },
  { path: '/streaming', label: { en: 'Streaming', zh: '流式输出' } },
  { path: '/web-search', label: { en: 'Web Search', zh: 'Web 搜索' } },
  { path: '/proxy-health', label: { en: 'Endpoints', zh: '端点' } },
];

export const ALL_SECTIONS: readonly ExplorerNavLink[] = [...PRIMARY_SECTIONS, ...MORE_SECTIONS];

const STRINGS = {
  en: { more: 'More', navLabel: 'Agentic Workload Explorer sections', select: 'Section' },
  zh: { more: '更多', navLabel: 'Agentic Workload Explorer 分区', select: '分区' },
};

/** Whether `relativePath` (explorer-relative) is inside the section at `sectionPath`. */
export function isActiveSection(relativePath: string | null, sectionPath: string): boolean {
  if (relativePath === null) return false;
  if (sectionPath === '/') return relativePath === '/';
  return relativePath === sectionPath || relativePath.startsWith(`${sectionPath}/`);
}

/** Number keys 1-9 jump to the first nine sections and 0 to the tenth. */
function useSectionHotkeys(locale: Locale) {
  const router = useRouter();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable)
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key < '0' || e.key > '9') return;
      const num = Number.parseInt(e.key, 10);
      const section = ALL_SECTIONS[num === 0 ? 9 : num - 1];
      if (!section) return;
      e.preventDefault();
      track('agentic_workload_section_hotkey', { section: section.path });
      router.push(explorerHref(section.path, locale));
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [locale, router]);
}

const tabClass = (active: boolean) =>
  cn(
    'inline-flex items-center gap-1 border-b-2 py-1 text-sm font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-none',
    active
      ? 'border-secondary text-secondary dark:border-primary dark:text-primary'
      : 'border-transparent text-muted-foreground hover:border-muted-foreground/30',
  );

function MoreMenu({ relativePath, locale }: { relativePath: string | null; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeLink = MORE_SECTIONS.find((link) => isActiveSection(relativePath, link.path));

  useEffect(() => setOpen(false), [relativePath]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          track('agentic_workload_more_menu_toggled', { open: !open });
          setOpen(!open);
        }}
        aria-expanded={open}
        className={tabClass(activeLink !== undefined)}
      >
        {activeLink?.label[locale] ?? STRINGS[locale].more}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 flex w-48 flex-col rounded-md border border-border bg-popover p-1 shadow-md">
          {MORE_SECTIONS.map((link) => (
            <Link
              key={link.path}
              href={explorerHref(link.path, locale)}
              onClick={() => track('agentic_workload_section_clicked', { section: link.path })}
              className={cn(
                'rounded-sm px-2.5 py-1.5 text-sm transition-colors',
                isActiveSection(relativePath, link.path)
                  ? 'bg-brand/10 text-brand'
                  : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground',
              )}
            >
              {link.label[locale]}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Explorer section tabs (desktop) and a section picker (mobile). */
export function SectionNav() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const relativePath = explorerRelativePath(pathname ?? '');
  const strings = STRINGS[locale];
  useSectionHotkeys(locale);

  const activePath = useMemo(
    () => ALL_SECTIONS.find((link) => isActiveSection(relativePath, link.path))?.path ?? '',
    [relativePath],
  );

  return (
    <>
      <label className="flex items-center gap-2 text-sm lg:hidden">
        <span className="text-muted-foreground">{strings.select}</span>
        <select
          value={activePath}
          onChange={(e) => {
            track('agentic_workload_section_selected', { section: e.target.value });
            router.push(explorerHref(e.target.value, locale));
          }}
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
        >
          {activePath === '' && <option value="" disabled />}
          {ALL_SECTIONS.map((link) => (
            <option key={link.path} value={link.path}>
              {link.label[locale]}
            </option>
          ))}
        </select>
      </label>
      <nav
        aria-label={strings.navLabel}
        className="relative z-40 hidden rounded-xl border border-border/40 bg-surface px-6 py-4 backdrop-blur-[2px] lg:block"
      >
        <div className="flex items-center justify-evenly gap-4">
          {PRIMARY_SECTIONS.map((link, index) => {
            const active = isActiveSection(relativePath, link.path);
            return (
              <Link
                key={link.path}
                href={explorerHref(link.path, locale)}
                aria-current={active ? 'page' : undefined}
                title={`${link.label[locale]} (${index + 1})`}
                onClick={() => track('agentic_workload_section_clicked', { section: link.path })}
                className={tabClass(active)}
              >
                {link.label[locale]}
              </Link>
            );
          })}
          <MoreMenu relativePath={relativePath} locale={locale} />
        </div>
      </nav>
    </>
  );
}
