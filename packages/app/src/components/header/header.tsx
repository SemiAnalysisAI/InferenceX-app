'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Braces,
  ChartLine,
  CircleDollarSign,
  Cpu,
  GitCompareArrows,
  Home,
  Info,
  LayoutGrid,
  Newspaper,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { track } from '@/lib/analytics';

import { ModeToggle } from '@/components/ui/mode-toggle';
import { NewBadge } from '@/components/ui/new-badge';
import { MinecraftToggles } from '@/components/minecraft/minecraft-toggles';
import { navigateInApp } from '@/lib/client-navigation';
import { DASHBOARD_ROUTES } from '@/lib/dashboard-routes';
import { useClientPathname } from '@/hooks/useClientPathname';
import { useClientSearch } from '@/hooks/useClientSearch';
import { hasZhSibling, isZhPathname, switchLocalePath, ZH_PREFIX, zhPath } from '@/lib/i18n';
import { NAV_LABELS_ZH, TAB_LABELS_ZH, type HeaderNavHref } from '@/lib/tab-meta-zh';
import { cn } from '@/lib/utils';

import { GitHubStars } from './GithubStars';

const DASHBOARD_TABS = DASHBOARD_ROUTES.map((route) => route.path);

/** Dashboard tabs surfaced as a nested group beneath the Dashboard entry. */
const PRIMARY_DASHBOARD_TABS = DASHBOARD_ROUTES.filter((route) => route.navGroup === 'primary');

// Kept in sync with TAB_LABELS_EN in tab-nav.tsx; duplicated here so the shell
// does not pull the dashboard tab bar (Select, Card, …) into its bundle.
const DASHBOARD_TAB_LABELS_EN: Record<string, string> = {
  inference: 'Inference Performance',
  evaluation: 'Accuracy Evals',
  historical: 'Historical Trends',
  calculator: 'TCO Calculator',
  fleet: 'Fleet Lifecycle',
  'gpu-specs': 'Chip Specs',
  submissions: 'Submissions',
};

interface NavLink {
  href: HeaderNavHref;
  label: string;
  testId: string;
  event: string;
  badge?: {
    en: string;
    zh: string;
  };
}

const NAV_LINKS: readonly NavLink[] = [
  {
    href: '/',
    label: 'Home',
    testId: 'nav-link-home',
    event: 'header_home_clicked',
  },
  // AgentX sits directly after Home: it is the flagship benchmark, and the
  // surface every entry below it ultimately explains.
  {
    href: '/agentx',
    label: 'AgentX',
    testId: 'nav-link-agentx',
    event: 'header_agentx_clicked',
    badge: { en: 'NEW', zh: '新' },
  },
  {
    href: '/overview',
    label: 'Overview',
    testId: 'nav-link-overview',
    event: 'header_overview_clicked',
  },
  {
    href: '/inference',
    label: 'Dashboard',
    testId: 'nav-link-dashboard',
    event: 'header_dashboard_clicked',
  },
  {
    href: '/compare',
    label: 'Comparisons',
    testId: 'nav-link-compare',
    event: 'header_compare_clicked',
  },
  {
    href: '/blog',
    label: 'Articles',
    testId: 'nav-link-articles',
    event: 'header_articles_clicked',
  },
  {
    href: '/about',
    label: 'About',
    testId: 'nav-link-about',
    event: 'header_about_clicked',
  },
] as const;

/** Icons shown only in the desktop sidebar; the mobile menu stays text-only. */
const NAV_ICONS: Record<HeaderNavHref, LucideIcon> = {
  '/': Home,
  '/agentx': Sparkles,
  '/overview': LayoutGrid,
  '/inference': ChartLine,
  '/compare': GitCompareArrows,
  '/blog': Newspaper,
  '/about': Info,
};

interface SecondaryLink {
  href: `/${string}`;
  en: string;
  zh: string;
  icon: LucideIcon;
  testId: string;
}

/**
 * Deep destinations that used to live only in the footer. The sidebar has the
 * vertical room to keep them one click away; they deliberately use the
 * `sidebar-link-*` testid namespace so the primary `nav-link-*` contract
 * (order, count) stays untouched.
 */
const SECONDARY_LINKS: readonly SecondaryLink[] = [
  {
    href: '/rankings',
    en: 'GPU Rankings',
    zh: 'GPU 排行榜',
    icon: Trophy,
    testId: 'sidebar-link-rankings',
  },
  {
    href: '/run',
    en: 'Model on GPU Results',
    zh: '模型实测结果',
    icon: Rocket,
    testId: 'sidebar-link-run',
  },
  {
    href: '/chips',
    en: 'Chip Specs & Pricing',
    zh: '芯片规格与价格',
    icon: Cpu,
    testId: 'sidebar-link-chips',
  },
  {
    href: '/reliability',
    en: 'Chip Reliability',
    zh: '芯片可靠性',
    icon: ShieldCheck,
    testId: 'sidebar-link-reliability',
  },
  {
    href: '/compare-per-dollar',
    en: 'Performance per Dollar',
    zh: '每美元性能',
    icon: CircleDollarSign,
    testId: 'sidebar-link-per-dollar',
  },
  {
    href: '/glossary',
    en: 'Glossary',
    zh: '术语表',
    icon: BookOpen,
    testId: 'sidebar-link-glossary',
  },
  {
    href: '/api',
    en: 'API Reference',
    zh: 'API 文档',
    icon: Braces,
    testId: 'sidebar-link-api',
  },
] as const;

const GROUP_LABELS = {
  en: { primary: 'Navigate', data: 'Data & Reference' },
  zh: { primary: '导航', data: '数据与参考' },
} as const;

function toEnPathname(pathname: string): string {
  // Chinese pages mirror the English tree under /zh; active state is computed
  // against the English path so both trees highlight the same nav entry.
  return isZhPathname(pathname)
    ? pathname === ZH_PREFIX
      ? '/'
      : pathname.slice(ZH_PREFIX.length)
    : pathname;
}

function isActive(pathname: string, href: string): boolean {
  const enPathname = toEnPathname(pathname);
  if (href === '/') return enPathname === '/';
  // Dashboard owns every tab path, including the telemetry catalog beneath
  // `/inference`, which now lives in the footer rather than the primary nav.
  if (href === '/inference') {
    return DASHBOARD_TABS.some((tab) => enPathname.startsWith(tab));
  }
  // Exact match or a child path under `<href>/...`. The bare `startsWith` would
  // light up `/compare` when the user is on `/compare-per-dollar/...` since the
  // latter starts with the literal string `/compare`.
  return enPathname === href || enPathname.startsWith(`${href}/`);
}

/** Active state for a single dashboard tab inside the nested sidebar group. */
function isTabActive(pathname: string, tabPath: string): boolean {
  const enPathname = toEnPathname(pathname);
  return enPathname === tabPath || enPathname.startsWith(`${tabPath}/`);
}

/**
 * Whether the link lands on the page already on screen. Deliberately not
 * `isActive`, which also lights up for every sibling dashboard tab and for
 * child routes — those are real destinations, so treating their clicks as
 * no-ops would strand the user (Dashboard from `/evaluation`, Comparisons
 * from `/compare/<slug>`).
 */
function isCurrentPage(pathname: string, displayHref: string): boolean {
  return pathname === displayHref;
}

/** EN ↔ 中文 switcher; maps the current page to its sibling in the other language. */
function LanguageToggle({
  pathname: routerPathname,
  router,
}: {
  pathname: string;
  router: ReturnType<typeof useRouter>;
}) {
  // The toggle maps the CURRENT address to its sibling, so it must see the
  // live pathname — per-model dashboard routes rewrite the URL with
  // replaceClientPathname on model switches, which usePathname ignores.
  const pathname = useClientPathname(routerPathname);
  const isZh = isZhPathname(pathname);
  const target = switchLocalePath(pathname);
  const search = useClientSearch();
  const isOverview = isActive(pathname, '/overview');
  return (
    <Link
      href={target + search}
      // Only /overview rewrites this href per interaction, which would
      // re-prefetch its force-dynamic sibling on every selector commit.
      // Everywhere else the href is stable, so let Next prefetch it.
      prefetch={isOverview ? false : undefined}
      data-testid="language-toggle"
      hrefLang={isZh ? 'en' : 'zh-CN'}
      className="inline-flex items-center min-h-11 px-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
      onClick={(event) => {
        track('header_language_toggled', { to: isZh ? 'en' : 'zh' });
        if (!isOverview) navigateInApp(event, router, target + search);
      }}
    >
      {isZh ? 'EN' : '中文'}
    </Link>
  );
}

/** Small uppercase heading above each sidebar group. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 pb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 select-none">
      {children}
    </span>
  );
}

/**
 * App shell navigation. Renders as a fixed left sidebar from the `xl`
 * breakpoint up — brand on top, grouped navigation in the middle, utilities
 * pinned to the bottom — and collapses into the previous sticky top bar with
 * a hamburger menu below `xl`. One DOM tree serves both layouts so every
 * testid exists exactly once.
 */
export const Header = ({ starCount }: { starCount?: number | null }) => {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isZh = isZhPathname(pathname);
  // On /zh pages, nav entries with a Chinese sibling navigate within the
  // Chinese tree and show Chinese labels; the rest keep their English target.
  const navLinks = isZh
    ? NAV_LINKS.map((link) => ({
        ...link,
        label: NAV_LABELS_ZH[link.href] ?? link.label,
        badgeLabel: link.badge?.zh,
        displayHref: hasZhSibling(link.href) ? zhPath(link.href) : link.href,
      }))
    : NAV_LINKS.map((link) => ({
        ...link,
        badgeLabel: link.badge?.en,
        displayHref: link.href,
      }));

  const groupLabels = isZh ? GROUP_LABELS.zh : GROUP_LABELS.en;
  const dashboardActive = isActive(pathname, '/inference');

  // Close menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close menu on click outside or Escape
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [mobileMenuOpen]);

  const toggleMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
    track('header_mobile_menu_toggled');
  }, []);

  return (
    <header
      data-testid="header"
      className={cn(
        // Below xl: the familiar sticky top bar.
        'sticky top-0 z-50 border-b border-border bg-background',
        // From xl up: a fixed, full-height left rail. The content column adds
        // matching left padding in the root layout.
        'xl:fixed xl:inset-y-0 xl:left-0 xl:w-72 xl:border-r xl:border-b-0',
      )}
    >
      <div className="container mx-auto px-4 lg:px-8 xl:m-0 xl:h-full xl:max-w-none xl:px-0">
        <div className="flex h-16 items-center gap-6 lg:h-[4.5rem] xl:h-full xl:flex-col xl:items-stretch xl:gap-0">
          {/* Brand */}
          <Link
            href={isZh ? '/zh' : '/'}
            data-testid="header-brand"
            className="flex items-center min-h-11 gap-2 shrink-0 xl:px-6 xl:pt-6 xl:pb-5"
          >
            <span className="pride-wordmark text-xl font-bold tracking-tight">InferenceX</span>
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              by
              <Image
                src="/brand/logo-color.webp"
                alt="SemiAnalysis logo"
                width={64}
                height={27}
                className="inline h-auto lg:w-16"
              />
            </span>
          </Link>

          {/* Desktop sidebar nav — grouped vertical rails. Hidden below xl,
              where the hamburger menu takes over. */}
          <div className="hidden xl:flex xl:min-h-0 xl:grow xl:flex-col xl:gap-7 xl:overflow-y-auto xl:px-3 xl:pt-1 xl:pb-6">
            <nav aria-label="Primary" className="flex flex-col gap-0.5">
              <GroupLabel>{groupLabels.primary}</GroupLabel>
              {navLinks.map(({ href, displayHref, label, badgeLabel, testId, event }) => {
                const Icon = NAV_ICONS[href];
                const active = isActive(pathname, href);
                return (
                  <div key={href} className="flex flex-col">
                    <Link
                      data-testid={testId}
                      href={displayHref}
                      prefetch={active ? false : undefined}
                      className={cn(
                        'relative flex items-center gap-2.5 rounded-md px-3 min-h-10 text-sm font-medium transition-colors',
                        'before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:transition-colors',
                        active
                          ? 'text-brand bg-accent before:bg-brand'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted before:bg-transparent',
                      )}
                      onClick={(e) => {
                        track(event);
                        // Re-entering the current page would refetch the route and
                        // discard whatever selector state the URL already carries.
                        if (isCurrentPage(pathname, displayHref)) {
                          e.preventDefault();
                          return;
                        }
                        if (href === '/overview' || href === '/inference') {
                          navigateInApp(e, router, displayHref);
                        }
                      }}
                    >
                      <Icon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
                      <span className="truncate">{label}</span>
                      {badgeLabel && (
                        <NewBadge data-nav-badge="agentx" data-new-badge="agentx-nav">
                          {badgeLabel}
                        </NewBadge>
                      )}
                    </Link>

                    {/* Dashboard tabs, nested while any dashboard route is on
                        screen so switching tabs never requires the tab bar. */}
                    {href === '/inference' && dashboardActive && (
                      <div className="ml-[1.4rem] mt-0.5 flex flex-col gap-px border-l border-border pl-2.5 py-0.5">
                        {PRIMARY_DASHBOARD_TABS.map((route) => {
                          const tabActive = isTabActive(pathname, route.path);
                          const tabHref =
                            isZh && hasZhSibling(route.path) ? zhPath(route.path) : route.path;
                          const tabLabel = isZh
                            ? TAB_LABELS_ZH[route.key]
                            : (DASHBOARD_TAB_LABELS_EN[route.key] ?? route.key);
                          return (
                            <Link
                              key={route.key}
                              data-testid={`sidebar-tab-${route.key}`}
                              href={tabHref}
                              prefetch={false}
                              className={cn(
                                'flex items-center rounded-md px-2.5 min-h-8 text-[0.8125rem] transition-colors',
                                tabActive
                                  ? 'text-brand bg-accent font-medium'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                              )}
                              onClick={(e) => {
                                window.dispatchEvent(new CustomEvent('inferencex:tab-change'));
                                track('sidebar_dashboard_tab_clicked', {
                                  tab: route.key,
                                });
                                if (isCurrentPage(pathname, tabHref)) {
                                  e.preventDefault();
                                  return;
                                }
                                navigateInApp(e, router, tabHref);
                              }}
                            >
                              <span className="truncate">{tabLabel}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            <nav aria-label={groupLabels.data} className="flex flex-col gap-0.5">
              <GroupLabel>{groupLabels.data}</GroupLabel>
              {SECONDARY_LINKS.map(({ href, en, zh, icon: Icon, testId }) => {
                const displayHref = isZh && hasZhSibling(href) ? zhPath(href) : href;
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    data-testid={testId}
                    href={displayHref}
                    prefetch={false}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-md px-3 min-h-9 text-[0.8125rem] font-medium transition-colors',
                      'before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:transition-colors',
                      active
                        ? 'text-brand bg-accent before:bg-brand'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted before:bg-transparent',
                    )}
                    onClick={(e) => {
                      track('sidebar_link_clicked', { href });
                      if (isCurrentPage(pathname, displayHref)) e.preventDefault();
                    }}
                  >
                    <Icon className="size-4 shrink-0 opacity-80" aria-hidden="true" />
                    <span className="truncate">{isZh ? zh : en}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Utilities — right-aligned in the top bar, pinned to the sidebar
              foot from xl up. */}
          <div className="ml-auto flex items-center gap-2 xl:ml-0 xl:mt-auto xl:shrink-0 xl:flex-wrap xl:border-t xl:border-border xl:px-4 xl:py-3.5">
            <span className="hidden sm:flex">
              <GitHubStars owner="SemiAnalysisAI" repo="InferenceX" starCount={starCount} />
            </span>
            <LanguageToggle pathname={pathname} router={router} />
            {/* Below `sm` these move into the mobile menu — they are what push
                a 320px header past its bounds in minecraft mode. */}
            <span className="hidden items-center gap-2 sm:flex">
              <MinecraftToggles />
            </span>
            <ModeToggle />

            {/* Mobile hamburger */}
            <div ref={menuRef} className="relative xl:hidden">
              <button
                type="button"
                data-testid="mobile-menu-toggle"
                onClick={toggleMenu}
                className="flex items-center justify-center size-11 rounded-md transition-colors hover:bg-muted cursor-pointer"
                aria-expanded={mobileMenuOpen}
                aria-label="Navigation menu"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="1" y1="4" x2="19" y2="4" />
                  <line x1="1" y1="10" x2="19" y2="10" />
                  <line x1="1" y1="16" x2="19" y2="16" />
                </svg>
              </button>
              {mobileMenuOpen && (
                <div
                  data-testid="mobile-menu"
                  className="absolute right-0 top-full mt-2 z-50 flex flex-col rounded-lg border border-border bg-background p-1.5 shadow-lg min-w-40"
                >
                  {navLinks.map(({ href, displayHref, label, badgeLabel, event }) => (
                    <Link
                      key={href}
                      href={displayHref}
                      prefetch={isActive(pathname, href) ? false : undefined}
                      className={cn(
                        'flex items-center min-h-11 px-3 rounded-md text-sm font-medium transition-colors',
                        isActive(pathname, href)
                          ? 'text-brand bg-accent'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                      )}
                      onClick={(e) => {
                        track(event);
                        if (isCurrentPage(pathname, displayHref)) {
                          e.preventDefault();
                          return;
                        }
                        if (href === '/overview' || href === '/inference') {
                          navigateInApp(e, router, displayHref);
                        }
                      }}
                    >
                      <span>{label}</span>
                      {badgeLabel && (
                        <NewBadge
                          data-nav-badge="agentx"
                          data-new-badge="agentx-nav"
                          className="ml-1.5"
                        >
                          {badgeLabel}
                        </NewBadge>
                      )}
                    </Link>
                  ))}
                  <span className="flex items-center gap-2 px-3 sm:hidden">
                    <MinecraftToggles />
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
