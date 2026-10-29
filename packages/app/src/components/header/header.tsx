'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics/analytics';

import { IntentPrefetchLink } from '@/components/ui/intent-prefetch-link';
import { ModeToggle } from '@/components/ui/mode-toggle';
import { HEADER_ACTION_STYLE } from '@/components/ui/control-styles';
import { NewBadge } from '@/components/ui/new-badge';
import { HaloTogglesLazy } from '@/components/halo/halo-toggles-lazy';
import { MinecraftTogglesLazy } from '@/components/minecraft/minecraft-toggles-lazy';
import { navigateInApp } from '@/lib/routing/client-navigation';
import { DASHBOARD_ROUTES } from '@/lib/routing/dashboard-routes';
import { useClientPathname } from '@/hooks/useClientPathname';
import { useClientSearch } from '@/hooks/useClientSearch';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { hasZhSibling, isZhPathname, switchLocalePath, ZH_PREFIX, zhPath } from '@/lib/i18n/i18n';
import { NAV_LABELS_ZH, type HeaderNavHref } from '@/lib/routing/tab-meta-zh';
import { cn } from '@/lib/shared/utils';

import { GitHubStars } from './GithubStars';
import { InferenceXWordmark } from './inferencex-wordmark';
import { SiteSearchButton } from './site-search-button';

const DASHBOARD_TABS = DASHBOARD_ROUTES.map((route) => route.path);

interface NavLink {
  href: HeaderNavHref;
  /** Where the link goes when it differs from the section root it highlights. */
  path?: string;
  label: string;
  testId: string;
  event: string;
  badge?: {
    en: string;
    zh: string;
  };
}

const NAV_LINKS: readonly NavLink[] = [
  { href: '/', label: 'Home', testId: 'nav-link-home', event: 'header_home_clicked' },
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
    href: '/ubenchx',
    path: '/ubenchx/mem-bw',
    label: 'ubenchX',
    testId: 'nav-link-ubenchx',
    event: 'header_ubenchx_clicked',
  },
  { href: '/about', label: 'About', testId: 'nav-link-about', event: 'header_about_clicked' },
] as const;

function isActive(pathname: string, href: string): boolean {
  const enPathname = isZhPathname(pathname)
    ? pathname === ZH_PREFIX
      ? '/'
      : pathname.slice(ZH_PREFIX.length)
    : pathname;
  if (href === '/') return enPathname === '/';
  if (href === '/inference') {
    return DASHBOARD_TABS.some((tab) => enPathname.startsWith(tab));
  }
  return enPathname === href || enPathname.startsWith(`${href}/`);
}

function isCurrentPage(pathname: string, displayHref: string): boolean {
  return pathname === displayHref;
}

function LanguageToggle({
  pathname: routerPathname,
  router,
}: {
  pathname: string;
  router: ReturnType<typeof useRouter>;
}) {
  const pathname = useClientPathname(routerPathname);
  const isZh = isZhPathname(pathname);
  const target = switchLocalePath(pathname);
  const search = useClientSearch();
  const isOverview = isActive(pathname, '/overview');
  return (
    <IntentPrefetchLink
      href={target + search}
      prefetch={isOverview ? false : undefined}
      data-testid="language-toggle"
      hrefLang={isZh ? 'en' : 'zh-CN'}
      className={cn(HEADER_ACTION_STYLE, 'min-h-11 px-2 text-sm font-medium whitespace-nowrap')}
      onClick={(event) => {
        track('header_language_toggled', { to: isZh ? 'en' : 'zh' });
        if (!isOverview) navigateInApp(event, router, target + search);
      }}
    >
      {isZh ? 'EN' : '中文'}
    </IntentPrefetchLink>
  );
}

export const Header = () => {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isZh = isZhPathname(pathname);
  const navLinks = isZh
    ? NAV_LINKS.map((link) => ({
        ...link,
        label: NAV_LABELS_ZH[link.href] ?? link.label,
        badgeLabel: link.badge?.zh,
        displayHref: hasZhSibling(link.href)
          ? zhPath(link.path ?? link.href)
          : (link.path ?? link.href),
      }))
    : NAV_LINKS.map((link) => ({
        ...link,
        badgeLabel: link.badge?.en,
        displayHref: link.path ?? link.href,
      }));

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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

  if (isEmbedPathname(pathname)) return null;

  return (
    <header
      data-testid="header"
      className="vt-site-header sticky top-0 z-50 border-b border-border/40 mb-4 bg-background/95 supports-[backdrop-filter]:bg-background/80 backdrop-blur-md"
    >
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex h-14 items-center gap-2 sm:gap-6">
          <IntentPrefetchLink
            href={isZh ? '/zh' : '/'}
            data-testid="header-brand"
            className="flex items-center min-h-11 gap-2 shrink-0"
          >
            <InferenceXWordmark />
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              by
              <Image
                src="/brand/logo-color.webp"
                alt="SemiAnalysis logo"
                width={64}
                height={27}
                className="inline h-auto lg:w-20"
              />
            </span>
          </IntentPrefetchLink>

          <nav className="hidden items-center gap-1 xl:flex">
            {navLinks.map(({ href, displayHref, label, badgeLabel, testId, event }) => (
              <IntentPrefetchLink
                key={href}
                data-testid={testId}
                href={displayHref}
                prefetch={isActive(pathname, href) ? false : undefined}
                aria-current={isActive(pathname, href) ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  isActive(pathname, href)
                    ? 'text-brand bg-brand/10'
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
                  <NewBadge data-nav-badge="agentx" data-new-badge="agentx-nav">
                    {badgeLabel}
                  </NewBadge>
                )}
              </IntentPrefetchLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-2">
            <span className="hidden sm:flex">
              <GitHubStars owner="SemiAnalysisAI" repo="InferenceX" />
            </span>
            <SiteSearchButton />
            <LanguageToggle pathname={pathname} router={router} />
            <span className="hidden items-center gap-2 sm:flex">
              <MinecraftTogglesLazy />
              <HaloTogglesLazy />
            </span>
            <ModeToggle />

            <div ref={menuRef} className="relative xl:hidden">
              <button
                type="button"
                data-testid="mobile-menu-toggle"
                onClick={toggleMenu}
                className={cn(HEADER_ACTION_STYLE, 'size-11')}
                aria-expanded={mobileMenuOpen}
                aria-label={isZh ? '导航菜单' : 'Navigation menu'}
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
                  aria-hidden
                  className="overflow-visible"
                >
                  <line
                    x1="1"
                    y1="4"
                    x2="19"
                    y2="4"
                    className="origin-center transition-transform duration-200 motion-reduce:transition-none"
                    style={
                      mobileMenuOpen ? { transform: 'translateY(6px) rotate(45deg)' } : undefined
                    }
                  />
                  <line
                    x1="1"
                    y1="10"
                    x2="19"
                    y2="10"
                    className="transition-opacity duration-150 motion-reduce:transition-none"
                    style={mobileMenuOpen ? { opacity: 0 } : undefined}
                  />
                  <line
                    x1="1"
                    y1="16"
                    x2="19"
                    y2="16"
                    className="origin-center transition-transform duration-200 motion-reduce:transition-none"
                    style={
                      mobileMenuOpen ? { transform: 'translateY(-6px) rotate(-45deg)' } : undefined
                    }
                  />
                </svg>
              </button>
              {mobileMenuOpen && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  data-testid="mobile-menu-backdrop"
                  onClick={toggleMenu}
                  className="fixed inset-x-0 top-14 h-[100dvh] z-40 cursor-default bg-black/40 animate-in fade-in-0 duration-150 sm:hidden"
                />
              )}
              {mobileMenuOpen && (
                <div
                  data-testid="mobile-menu"
                  className="motion-pop-in fixed inset-x-3 top-[3.75rem] z-50 flex max-h-[calc(100dvh-4.5rem)] flex-col overflow-y-auto overscroll-contain rounded-xl border border-border bg-background p-1.5 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:min-w-40 sm:rounded-lg"
                >
                  {navLinks.map(({ href, displayHref, label, badgeLabel, event }) => (
                    <IntentPrefetchLink
                      key={href}
                      href={displayHref}
                      prefetch={isActive(pathname, href) ? false : undefined}
                      aria-current={isActive(pathname, href) ? 'page' : undefined}
                      className={cn(
                        'flex items-center min-h-12 px-4 rounded-lg text-base font-medium transition-colors sm:min-h-11 sm:px-3 sm:rounded-md sm:text-sm',
                        isActive(pathname, href)
                          ? 'text-brand bg-brand/10'
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
                    </IntentPrefetchLink>
                  ))}
                  <span className="mt-1 flex items-center gap-2 border-t border-border/60 px-3 pt-2 pb-1 sm:hidden">
                    <MinecraftTogglesLazy />
                    <HaloTogglesLazy />
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
