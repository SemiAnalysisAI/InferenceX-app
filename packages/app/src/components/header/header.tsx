'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';

import { ModeToggle } from '@/components/ui/mode-toggle';
import { MinecraftToggles } from '@/components/minecraft/minecraft-toggles';
import { CLIENT_SEARCH_CHANGE_EVENT, navigateInApp } from '@/lib/client-navigation';
import { hasZhSibling, isZhPathname, switchLocalePath, ZH_PREFIX, zhPath } from '@/lib/i18n';
import { NAV_LABELS_ZH } from '@/lib/tab-meta-zh';
import { cn } from '@/lib/utils';

import { GitHubStars } from './GithubStars';

/** Dashboard tab paths that should highlight the "Dashboard" nav link. */
const DASHBOARD_TABS = [
  '/inference',
  '/evaluation',
  '/historical',
  '/calculator',
  '/reliability',
  '/gpu-specs',
  '/gpu-metrics',
  '/collectivex',
  '/submissions',
  '/current-inferencex-image',
];

const NAV_LINKS = [
  { href: '/', label: 'Home', testId: 'nav-link-home', event: 'header_home_clicked' },
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
  { href: '/about', label: 'About', testId: 'nav-link-about', event: 'header_about_clicked' },
] as const;

function isActive(pathname: string, href: string): boolean {
  // Chinese pages mirror the English tree under /zh; active state is computed
  // against the English path so both trees highlight the same nav entry.
  const enPathname = isZhPathname(pathname)
    ? pathname === ZH_PREFIX
      ? '/'
      : pathname.slice(ZH_PREFIX.length)
    : pathname;
  if (href === '/') return enPathname === '/';
  if (href === '/inference') return DASHBOARD_TABS.some((tab) => enPathname.startsWith(tab));
  // Exact match or a child path under `<href>/...`. The bare `startsWith` would
  // light up `/compare` when the user is on `/compare-per-dollar/...` since the
  // latter starts with the literal string `/compare`.
  return enPathname === href || enPathname.startsWith(`${href}/`);
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
  pathname,
  router,
}: {
  pathname: string;
  router: ReturnType<typeof useRouter>;
}) {
  const isZh = isZhPathname(pathname);
  const target = switchLocalePath(pathname);
  // The root layout is reused for search-only App Router transitions, so keep
  // this persistent link synchronized with both browser history and the app's
  // explicit soft-navigation signal.
  const [search, setSearch] = useState('');
  useEffect(() => {
    const sync = (event: Event) => {
      setSearch(
        event instanceof CustomEvent && typeof event.detail === 'string'
          ? event.detail
          : window.location.search,
      );
    };
    sync(new Event('initial'));
    window.addEventListener('popstate', sync);
    window.addEventListener(CLIENT_SEARCH_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(CLIENT_SEARCH_CHANGE_EVENT, sync);
    };
  }, [pathname]);
  return (
    <Link
      href={target + search}
      // Only /overview rewrites this href per interaction, which would
      // re-prefetch its force-dynamic sibling on every selector commit.
      // Everywhere else the href is stable, so let Next prefetch it.
      prefetch={isActive(pathname, '/overview') ? false : undefined}
      data-testid="language-toggle"
      hrefLang={isZh ? 'en' : 'zh-CN'}
      className="inline-flex items-center min-h-11 px-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
      onClick={(event) => {
        track('header_language_toggled', { to: isZh ? 'en' : 'zh' });
        navigateInApp(event, router, target + search);
      }}
    >
      {isZh ? 'EN' : '中文'}
    </Link>
  );
}

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
        displayHref: hasZhSibling(link.href) ? zhPath(link.href) : link.href,
      }))
    : NAV_LINKS.map((link) => ({ ...link, displayHref: link.href }));

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
      className="sticky top-0 z-50 border-b border-border/40 mb-4 bg-background/60 backdrop-blur-[2px]"
    >
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex h-14 items-center gap-6">
          {/* Brand */}
          <Link
            href={isZh ? '/zh' : '/'}
            data-testid="header-brand"
            className="flex items-center min-h-11 gap-2 shrink-0"
          >
            <span className="pride-wordmark text-lg font-bold tracking-tight">InferenceX</span>
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
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map(({ href, displayHref, label, testId, event }) => (
              <Link
                key={href}
                data-testid={testId}
                href={displayHref}
                prefetch={isActive(pathname, href) ? false : undefined}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  isActive(pathname, href)
                    ? 'text-brand bg-brand/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
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
                {label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
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
            <div ref={menuRef} className="relative lg:hidden">
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
                  {navLinks.map(({ href, displayHref, label, event }) => (
                    <Link
                      key={href}
                      href={displayHref}
                      prefetch={isActive(pathname, href) ? false : undefined}
                      className={cn(
                        'flex items-center min-h-11 px-3 rounded-md text-sm font-medium transition-colors',
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
                      {label}
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
